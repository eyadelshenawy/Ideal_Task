"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/apiClient";

interface TaskEvent {
  id: string;
  type: "COMMENT" | "ACTIVITY";
  message: string;
  authorName: string | null;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TaskActivityPanel({ taskId }: { taskId: string }) {
  const { data: events, mutate } = useSWR<TaskEvent[]>(`/api/tasks/${taskId}/events`, fetcher);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await api.addTaskComment(taskId, draft.trim());
      setDraft("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-brand-border mt-4 pt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-sub mb-2">
        <MessageSquare size={13} /> Comments & Activity
      </div>

      <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1.5 mb-2">
        {(!events || events.length === 0) && (
          <div className="text-[11px] text-brand-sub">No activity yet</div>
        )}
        {events?.map((e) =>
          e.type === "COMMENT" ? (
            <div key={e.id} className="bg-brand-bg rounded-lg px-2.5 py-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-brand-text">{e.authorName ?? "Former member"}</span>
                <span className="text-[10px] text-brand-sub">{formatWhen(e.createdAt)}</span>
              </div>
              <div className="text-[12px] text-brand-text whitespace-pre-wrap">{e.message}</div>
            </div>
          ) : (
            <div key={e.id} className="text-[11px] text-brand-sub whitespace-pre-wrap">
              <span className="font-medium">{e.authorName ?? "Former member"}</span> — {e.message}
              <span className="ml-1 text-[10px]">· {formatWhen(e.createdAt)}</span>
            </div>
          )
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") submit(); }}
          placeholder="Add a comment…"
          className="flex-1 min-w-0 rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none"
        />
        <button
          onClick={submit}
          disabled={submitting || !draft.trim()}
          className="rounded-lg px-3 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  );
}
