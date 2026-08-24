"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, Loader2, Paperclip, Diamond, Send } from "lucide-react";
import { STATUSES, formatDateDisplay } from "@/lib/taskHelpers";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface Comment {
  id: string;
  from: "team" | "customer";
  message: string;
  createdAt: string;
}
interface AttachmentInfo {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  url: string;
}
interface TaskDetail {
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  progress: number;
  isMilestone: boolean;
  comments: Comment[];
  attachments: AttachmentInfo[];
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load this task");
  return r.json();
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShareTaskDetailModal({ shareToken, taskId, onClose }: { shareToken: string; taskId: string; onClose: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<TaskDetail>(`/api/public/share/${shareToken}/task/${taskId}`, fetcher);
  const status = data ? STATUSES.find((s) => s.id === data.status) ?? STATUSES[0] : null;

  const [name, setName] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("share.commenterName") ?? "" : ""));
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName || !trimmedMessage) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/share/${shareToken}/task/${taskId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, message: trimmedMessage }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.error || "Couldn't post your comment");
        return;
      }
      if (typeof window !== "undefined") localStorage.setItem("share.commenterName", trimmedName);
      setMessage("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[480px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-brand-border flex-shrink-0">
          <h2 className="font-bold text-[15px] text-brand-text">{data?.code ?? "Task details"}</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-brand-dark" size={24} /></div>
          )}
          {error && <div className="text-sm text-brand-sub text-center py-10">Couldn&apos;t load this task.</div>}
          {data && status && (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {data.isMilestone && <Diamond size={13} className="text-brand-dark" />}
                <span className="font-semibold text-[15px] text-brand-text flex-1">{data.title}</span>
                <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
              </div>
              {data.dueDate && <div className="text-[11.5px] text-brand-sub mb-2">Due {formatDateDisplay(data.dueDate)}</div>}
              {!data.isMilestone && <ProgressBar value={data.progress} color={status.color} />}

              {data.description && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-brand-sub mb-1">Description</div>
                  <div className="text-[13px] text-brand-text whitespace-pre-wrap">{data.description}</div>
                </div>
              )}

              {data.attachments.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-brand-sub mb-1.5">Attachments</div>
                  <div className="flex flex-col gap-1">
                    {data.attachments.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12.5px] text-brand-dark hover:underline">
                        <Paperclip size={12} /> {a.fileName} <span className="text-brand-sub">({formatFileSize(a.fileSize)})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-xs font-semibold text-brand-sub mb-1.5">Conversation</div>
                {data.comments.length === 0 ? (
                  <div className="text-[12.5px] text-brand-sub">No messages yet — start the conversation below.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.comments.map((c) => (
                      <div key={c.id} className="rounded-lg px-3 py-2" style={{ background: c.from === "team" ? "#E8F1EC" : "#F5F1E8" }}>
                        <div className="text-[10.5px] text-brand-sub mb-0.5">
                          {c.from === "team" ? "Team" : "You"} · {formatDateDisplay(c.createdAt.slice(0, 10))}
                        </div>
                        <div className="text-[12.5px] text-brand-text whitespace-pre-wrap">{c.message}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 border border-brand-border rounded-lg p-2.5">
                  <div className="text-[11px] font-semibold text-brand-sub mb-1.5">Add a comment</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={80}
                    className="w-full text-[13px] px-2 py-1.5 border border-brand-border rounded-md mb-1.5"
                  />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Your message to the team…"
                    rows={3}
                    maxLength={5000}
                    className="w-full text-[13px] px-2 py-1.5 border border-brand-border rounded-md resize-none"
                  />
                  {submitError && <div className="text-[11.5px] mt-1" style={{ color: "#B84A2A" }}>{submitError}</div>}
                  <div className="flex justify-end mt-1.5">
                    <button
                      onClick={submit}
                      disabled={submitting || !name.trim() || !message.trim()}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-brand-dark text-white"
                      style={{ opacity: submitting || !name.trim() || !message.trim() ? 0.5 : 1 }}
                    >
                      {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
