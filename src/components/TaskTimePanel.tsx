"use client";

import { useState } from "react";
import useSWR from "swr";
import { Clock, X, Pencil, Check } from "lucide-react";
import { formatDateDisplay, todayStr } from "@/lib/taskHelpers";
import type { TeamMember } from "@/types/models";

interface TimeEntry {
  id: string;
  hours: number;
  date: string;
  note: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  taskId: string;
  currentUserId?: string;
  /** Super Admin OR Project Admin of the task's project — decides whether the
   *  "Log for someone else" dropdown appears and whether other users' entries
   *  can be edited/removed. */
  canManageOthers?: boolean;
  team: TeamMember[];
}

export default function TaskTimePanel({ taskId, currentUserId, canManageOthers, team }: Props) {
  const { data: entries, mutate } = useSWR<TimeEntry[]>(`/api/tasks/${taskId}/time`, fetcher);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [logForUserId, setLogForUserId] = useState<string>(currentUserId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ hours: string; date: string; note: string; userId: string }>({ hours: "", date: "", note: "", userId: "" });

  const total = entries?.reduce((sum, e) => sum + e.hours, 0) ?? 0;
  const activeTeam = team.filter((m) => m.active);

  async function addEntry() {
    const hoursNum = Number(hours);
    if (!hoursNum || hoursNum <= 0) {
      setError("Enter hours greater than 0");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { hours: hoursNum, date, note: note.trim() || undefined };
      if (canManageOthers && logForUserId && logForUserId !== currentUserId) body.userId = logForUserId;
      const res = await fetch(`/api/tasks/${taskId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(typeof b.error === "string" ? b.error : "Couldn't log time");
        return;
      }
      setHours("");
      setNote("");
      setLogForUserId(currentUserId ?? "");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(e: TimeEntry) {
    setEditingId(e.id);
    setEditDraft({ hours: String(e.hours), date: e.date, note: e.note ?? "", userId: e.userId ?? "" });
  }

  async function saveEdit(entryId: string) {
    const hoursNum = Number(editDraft.hours);
    if (!hoursNum || hoursNum <= 0) return;
    const body: Record<string, unknown> = { hours: hoursNum, date: editDraft.date, note: editDraft.note.trim() || null };
    if (canManageOthers && editDraft.userId) body.userId = editDraft.userId;
    const res = await fetch(`/api/tasks/${taskId}/time/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    setEditingId(null);
    await mutate();
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/tasks/${taskId}/time/${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="border-t border-brand-border mt-4 pt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-sub mb-2">
        <Clock size={13} /> Time logged{entries && entries.length > 0 && ` — ${total}h total`}
      </div>

      <div className="flex flex-col gap-1 mb-2">
        {entries?.map((e) => {
          const canManage = canManageOthers || e.userId === currentUserId;
          const isEditing = editingId === e.id;
          if (isEditing) {
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-1.5 bg-brand-bg rounded-lg px-2.5 py-1.5">
                <input type="number" min="0.25" step="0.25" value={editDraft.hours} onChange={(ev) => setEditDraft({ ...editDraft, hours: ev.target.value })} className="w-[70px] rounded border border-brand-border px-1.5 py-0.5 text-xs outline-none" />
                <input type="date" value={editDraft.date} onChange={(ev) => setEditDraft({ ...editDraft, date: ev.target.value })} className="rounded border border-brand-border px-1.5 py-0.5 text-xs outline-none" />
                {canManageOthers && (
                  <select value={editDraft.userId} onChange={(ev) => setEditDraft({ ...editDraft, userId: ev.target.value })} className="rounded border border-brand-border px-1.5 py-0.5 text-xs outline-none">
                    {activeTeam.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                  </select>
                )}
                <input value={editDraft.note} onChange={(ev) => setEditDraft({ ...editDraft, note: ev.target.value })} placeholder="Note" className="flex-1 min-w-[100px] rounded border border-brand-border px-1.5 py-0.5 text-xs outline-none" />
                <button onClick={() => saveEdit(e.id)} className="p-0.5 rounded text-brand-dark hover:bg-brand-dark/10" title="Save"><Check size={13} /></button>
                <button onClick={() => setEditingId(null)} className="p-0.5 rounded text-brand-sub hover:bg-gray-200" title="Cancel"><X size={13} /></button>
              </div>
            );
          }
          return (
            <div key={e.id} className="flex items-center gap-2 group bg-brand-bg rounded-lg px-2.5 py-1.5">
              <span className="text-[12.5px] font-semibold text-brand-text">{e.hours}h</span>
              <span className="text-[11px] text-brand-sub">{formatDateDisplay(e.date)}</span>
              <span className="text-[11px] text-brand-sub">{e.userName ?? "Former member"}</span>
              {e.note && <span className="text-[11.5px] text-brand-text flex-1 truncate">{e.note}</span>}
              {canManage && (
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => startEdit(e)} className="p-0.5 rounded hover:bg-gray-200 text-brand-sub" title="Edit"><Pencil size={11} /></button>
                  <button onClick={() => deleteEntry(e.id)} className="p-0.5 rounded hover:bg-gray-200 text-brand-sub" title="Remove"><X size={12} /></button>
                </div>
              )}
            </div>
          );
        })}
        {(!entries || entries.length === 0) && (
          <div className="text-[11px] text-brand-sub">No time logged yet</div>
        )}
      </div>

      <div className="flex gap-1.5 items-center flex-wrap">
        <input
          type="number" min="0.25" step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="Hours"
          className="w-[70px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
        />
        {canManageOthers && activeTeam.length > 1 && (
          <select
            value={logForUserId}
            onChange={(e) => setLogForUserId(e.target.value)}
            title="Log this time for"
            className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none bg-white"
          >
            {activeTeam.map((m) => (
              <option key={m.id} value={m.id}>{m.id === currentUserId ? "Me" : m.name}</option>
            ))}
          </select>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="flex-1 min-w-[100px] rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none"
        />
        <button
          onClick={addEntry}
          disabled={submitting || !hours}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
        >
          Log
        </button>
      </div>
      {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
    </div>
  );
}
