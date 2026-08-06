"use client";

import { useState } from "react";
import useSWR from "swr";
import { Clock, X } from "lucide-react";
import { formatDateDisplay, todayStr } from "@/lib/taskHelpers";

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

export default function TaskTimePanel({ taskId, currentUserId, isSuperAdmin }: { taskId: string; currentUserId?: string; isSuperAdmin?: boolean }) {
  const { data: entries, mutate } = useSWR<TimeEntry[]>(`/api/tasks/${taskId}/time`, fetcher);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = entries?.reduce((sum, e) => sum + e.hours, 0) ?? 0;

  async function addEntry() {
    const hoursNum = Number(hours);
    if (!hoursNum || hoursNum <= 0) {
      setError("Enter hours greater than 0");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: hoursNum, date, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Couldn't log time");
        return;
      }
      setHours("");
      setNote("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
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
          const canRemove = isSuperAdmin || e.userId === currentUserId;
          return (
            <div key={e.id} className="flex items-center gap-2 group bg-brand-bg rounded-lg px-2.5 py-1.5">
              <span className="text-[12.5px] font-semibold text-brand-text">{e.hours}h</span>
              <span className="text-[11px] text-brand-sub">{formatDateDisplay(e.date)}</span>
              <span className="text-[11px] text-brand-sub">{e.userName ?? "Former member"}</span>
              {e.note && <span className="text-[11.5px] text-brand-text flex-1 truncate">{e.note}</span>}
              {canRemove && (
                <button onClick={() => deleteEntry(e.id)} className="p-0.5 rounded hover:bg-gray-200 text-brand-sub opacity-0 group-hover:opacity-100 ml-auto">
                  <X size={12} />
                </button>
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
