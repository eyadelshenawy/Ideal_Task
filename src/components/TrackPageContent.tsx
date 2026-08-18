"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Send, Check } from "lucide-react";
import { STATUSES, formatDateDisplay } from "@/lib/taskHelpers";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface TrackData {
  code: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  progress: number;
  projectName: string | null;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

export default function TrackPageContent({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<TrackData>(`/api/public/track/${token}`, fetcher, { refreshInterval: 30000 });
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`/api/public/track/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send your reply");
      setReply("");
      setSent(true);
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
          {sent ? (
            <div className="flex items-center gap-1.5 text-[12px] text-brand-dark py-1">
              <Check size={14} /> Sent — our team will follow up.
            </div>
          ) : (
            <>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply here…"
                rows={3}
                maxLength={5000}
                className="w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-[12.5px] outline-none resize-y"
              />
              {sendError && <div className="text-[11px] text-red-600 mt-1">{sendError}</div>}
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="mt-1.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold bg-brand-dark text-white disabled:opacity-50"
              >
                <Send size={12} /> {sending ? "Sending…" : "Send reply"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
      </div>
    </div>
  );
}
