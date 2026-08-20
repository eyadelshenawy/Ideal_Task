"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Send, Paperclip, X, Download } from "lucide-react";
import { STATUSES, formatDateDisplay } from "@/lib/taskHelpers";
import { MAX_FILE_MB, MAX_TOTAL_MB, FILE_INPUT_ACCEPT } from "@/lib/uploadLimits";
import { matchAttachmentLines, ATTACHMENT_LINE_PREFIX } from "@/lib/attachmentMatcher";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";


interface ThreadMessage {
  id: string;
  from: "team" | "customer";
  message: string;
  createdAt: string;
}

interface AttachmentRef {
  id: string;
  fileName: string;
  createdAt: string;
}

interface TrackData {
  code: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  progress: number;
  projectName: string | null;
  thread: ThreadMessage[];
  attachments: AttachmentRef[];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

export default function TrackPageContent({ token }: { token: string }) {
  const { data, error, isLoading, mutate } = useSWR<TrackData>(`/api/public/track/${token}`, fetcher, { refreshInterval: 30000 });
  const attachmentLineMap = useMemo(
    () => matchAttachmentLines(data?.thread ?? [], data?.attachments ?? []),
    [data?.thread, data?.attachments]
  );
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  function onFilesChange(picked: FileList | null) {
    setSendError("");
    if (!picked || picked.length === 0) return;
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setSendError(`"${f.name}" is too large (max ${MAX_FILE_MB}MB each)`);
        continue;
      }
      const totalMB = [...next, f].reduce((sum, x) => sum + x.size, 0) / (1024 * 1024);
      if (totalMB > MAX_TOTAL_MB) {
        setSendError(`Attachments are too large together (max ${MAX_TOTAL_MB}MB combined)`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function downloadAttachment(attachmentId: string) {
    const res = await fetch(`/api/public/track/${token}/attachments/${attachmentId}`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const form = new FormData();
      form.set("message", reply.trim());
      files.forEach((f) => form.append("file", f));
      const res = await fetch(`/api/public/track/${token}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send your reply");
      setReply("");
      setFiles([]);
      await mutate();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send your reply");
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-dark" size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center text-brand-sub text-sm">This link is no longer valid.</div>
      </div>
    );
  }

  const status = STATUSES.find((s) => s.id === data.status) ?? STATUSES[0];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-4">
        <div className="max-w-[480px] mx-auto">
          <div className="text-white font-bold text-[16px]">{data.projectName ?? "Your request"}</div>
          <div className="text-[#CFE3D8] text-[12px]">Request status — read only</div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-5">
        <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3" style={{ borderRight: `4px solid ${status.color}` }}>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {data.code && <span className="font-mono text-[11px] text-brand-sub">{data.code}</span>}
              <span className="font-semibold text-[14px] text-brand-text">{data.title}</span>
            </div>
            <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
          </div>
          {data.dueDate && <div className="text-[11.5px] text-brand-sub mb-1.5">Expected: {formatDateDisplay(data.dueDate)}</div>}
          <ProgressBar value={data.progress} color={status.color} />
        </div>

        <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3 mt-3">
          <div className="text-[12.5px] font-semibold text-brand-text mb-1.5">Have a question or update?</div>

          {data.thread.length > 0 && (
            <div className="flex flex-col gap-2 mb-3 max-h-[260px] overflow-y-auto">
              {data.thread.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg px-2.5 py-1.5 max-w-[85%]"
                  style={m.from === "team"
                    ? { background: "#EEF3F0", alignSelf: "flex-start" }
                    : { background: "#0A5A46", color: "#fff", alignSelf: "flex-end" }}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10.5px] font-semibold" style={{ opacity: 0.75 }}>
                      {m.from === "team" ? "Our team" : "You"}
                    </span>
                    <span className="text-[10px]" style={{ opacity: 0.6 }}>{formatWhen(m.createdAt)}</span>
                  </div>
                  <div className="text-[12px] flex flex-col gap-0.5">
                    {m.message.split("\n").map((line, i) => {
                      const attachmentId = attachmentLineMap.get(`${m.id}#${i}`);
                      if (attachmentId) {
                        return (
                          <button
                            key={i}
                            onClick={() => downloadAttachment(attachmentId)}
                            className="flex items-center gap-1 self-start underline"
                          >
                            <Download size={11} /> {line.slice(ATTACHMENT_LINE_PREFIX.length)}
                          </button>
                        );
                      }
                      return <div key={i} className="whitespace-pre-wrap">{line}</div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply here…"
            rows={3}
            maxLength={5000}
            className="w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-[12.5px] outline-none resize-y"
          />
          {files.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-brand-text bg-brand-bg rounded-lg border border-brand-border px-2 py-1">
                  <Paperclip size={11} className="flex-shrink-0 text-brand-sub" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="flex-shrink-0 text-brand-sub hover:text-red-600">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {files.reduce((sum, f) => sum + f.size, 0) < MAX_TOTAL_MB * 1024 * 1024 && (
            <label className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-dashed border-brand-border px-2.5 py-1.5 text-[12px] bg-white cursor-pointer text-brand-sub">
              <Paperclip size={12} />
              {`Attach files (optional, max ${MAX_FILE_MB}MB each, ${MAX_TOTAL_MB}MB combined)`}
              <input
                type="file"
                multiple
                accept={FILE_INPUT_ACCEPT}
                onChange={(e) => { onFilesChange(e.target.files); e.target.value = ""; }}
                className="hidden"
              />
            </label>
          )}
          {sendError && <div className="text-[11px] text-red-600 mt-1">{sendError}</div>}
          <button
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            className="mt-1.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-brand-dark text-white disabled:opacity-50"
          >
            <Send size={12} /> {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
      </div>
    </div>
  );
}
