"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquare, Pencil } from "lucide-react";
import { api } from "@/lib/apiClient";

interface TaskEvent {
  id: string;
  type: "COMMENT" | "ACTIVITY";
  message: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TaskActivityPanelProps {
  taskId: string;
  currentUserId?: string;
  isSuperAdmin?: boolean;
}

export default function TaskActivityPanel({ taskId, currentUserId, isSuperAdmin }: TaskActivityPanelProps) {
  const { data: events, mutate } = useSWR<TaskEvent[]>(`/api/tasks/${taskId}/events`, fetcher);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  function startEdit(e: TaskEvent) {
    setEditingId(e.id);
    setEditDraft(e.message);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(eventId: string) {
    if (!editDraft.trim()) return;
    setSavingEdit(true);
    try {
      await api.updateTaskComment(taskId, eventId, editDraft.trim());
      setEditingId(null);
      setEditDraft("");
      await mutate();
    } finally {
      setSavingEdit(false);
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
        {events?.map((e) => {
          if (e.type !== "COMMENT") {
            return (
              <div key={e.id} className="text-[11px] text-brand-sub whitespace-pre-wrap">
                <span className="font-medium">{e.authorName ?? "Former member"}</span> — {e.message}
                <span className="ml-1 text-[10px]">· {formatWhen(e.createdAt)}</span>
              </div>
            );
          }
          const canEdit = !!currentUserId && (e.authorId === currentUserId || !!isSuperAdmin);
          const isEditing = editingId === e.id;
          return (
            <div key={e.id} className="bg-brand-bg rounded-lg px-2.5 py-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-brand-text">{e.authorName ?? "Former member"}</span>
                <span className="text-[10px] text-brand-sub">{formatWhen(e.createdAt)}</span>
                {e.editedAt && <span className="text-[10px] text-brand-sub italic">(edited)</span>}
                {canEdit && !isEditing && (
                  <button onClick={() => startEdit(e)} title="Edit comment" className="ml-auto p-0.5 text-brand-sub hover:text-brand-text">
                    <Pencil size={11} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="flex flex-col gap-1.5 mt-1">
                  <textarea
                    value={editDraft}
                    onChange={(ev) => setEditDraft(ev.target.value)}
                    rows={3}
                    maxLength={20000}
                    className="w-full rounded-lg border border-brand-border px-2 py-1 text-xs outline-none resize-y"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={cancelEdit} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-brand-sub hover:bg-gray-100">
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(e.id)}
                      disabled={savingEdit || !editDraft.trim()}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-brand-text whitespace-pre-wrap">{e.message}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) submit(); }}
          placeholder="Add a comment… (Ctrl/Cmd + Enter to post)"
          rows={4}
          maxLength={20000}
          className="w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none resize-y"
        />
        <button
          onClick={submit}
          disabled={submitting || !draft.trim()}
          className="self-end rounded-lg px-3 py-1.5 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  );
}
