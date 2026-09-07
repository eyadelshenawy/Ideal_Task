"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, Trash2, Plus, Loader2, Calendar } from "lucide-react";
import type { WorkWeekConfig, Holiday } from "@/types/models";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DAYS: { key: keyof WorkWeekConfig; label: string }[] = [
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

// Shows Work-week toggle + Holidays list in one modal, matching the "one
// place to configure how dates work" mental model. Super-Admin-only actions
// (save, add, delete) are hidden for non-admins — server enforces this too.
export default function WorkCalendarModal({
  onClose,
  canEdit,
}: {
  onClose: () => void;
  canEdit: boolean;
}) {
  const { data: config, mutate: mutateConfig } = useSWR<WorkWeekConfig>("/api/settings/work-week", fetcher);
  const { data: holidays, mutate: mutateHolidays } = useSWR<Holiday[]>("/api/holidays", fetcher);

  const [draft, setDraft] = useState<WorkWeekConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const workWeek = draft ?? config ?? null;

  function toggleDay(key: keyof WorkWeekConfig) {
    if (!canEdit) return;
    const base = workWeek ?? { sun: true, mon: true, tue: true, wed: true, thu: true, fri: false, sat: false };
    setDraft({ ...base, [key]: !base[key] });
  }

  async function saveWorkWeek() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/work-week", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't save");
      }
      await mutateConfig();
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday() {
    if (!newName.trim() || !newDate) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), date: newDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't add holiday");
      }
      setNewName("");
      setNewDate("");
      await mutateHolidays();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add holiday");
    } finally {
      setAdding(false);
    }
  }

  async function deleteHoliday(id: string) {
    await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    setConfirmingId(null);
    await mutateHolidays();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Sticky header: title + description + work-week row + add-holiday row.
            The Holidays list below is the only part that scrolls, so the
            controls the user needs to see stay pinned even with 30 holidays. */}
        <div className="p-5 pb-3 border-b border-brand-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="flex items-center gap-1.5 font-bold text-[16px] text-brand-text">
              <Calendar size={16} className="text-brand-dark" /> Work Calendar
            </h2>
            <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
          </div>
          <div className="text-[11.5px] text-brand-sub mb-3">
            Working days and holidays used by any task&apos;s Duration ↔ Due auto-compute. Pick a duration and the app skips the days marked off here.
          </div>
          {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

          <div className="mb-3">
            <div className="text-[11px] font-bold text-brand-sub uppercase tracking-wide mb-1.5">Work week</div>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d) => {
                const on = workWeek ? workWeek[d.key] : d.key !== "fri" && d.key !== "sat";
                return (
                  <button
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    disabled={!canEdit}
                    className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold border transition-colors"
                    style={{
                      background: on ? "#1F5548" : "transparent",
                      color: on ? "white" : "#5B6B64",
                      borderColor: on ? "#1F5548" : "#E5E7E3",
                      cursor: canEdit ? "pointer" : "default",
                      opacity: canEdit ? 1 : 0.7,
                    }}
                    title={on ? "Working day" : "Non-working day"}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {canEdit && draft && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveWorkWeek}
                  disabled={saving}
                  className="rounded-lg px-3 py-1 text-[11.5px] font-semibold bg-brand-dark text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
                  Save work week
                </button>
                <button
                  onClick={() => setDraft(null)}
                  className="text-[11.5px] text-brand-sub px-2"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="text-[11px] font-bold text-brand-sub uppercase tracking-wide mb-1.5">Holidays</div>
          {canEdit && (
            <div className="flex gap-1.5">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-[130px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Holiday name (e.g. Eid al-Adha)"
                className="flex-1 rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
              />
              <button
                onClick={addHoliday}
                disabled={adding || !newName.trim() || !newDate}
                className="rounded-lg px-3 bg-brand-dark text-white disabled:opacity-50"
                title="Add holiday"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Only the holidays list scrolls */}
        <div className="flex-1 overflow-y-auto p-5 pt-3">
          {(!holidays || holidays.length === 0) && (
            <div className="text-[11.5px] text-brand-sub">No holidays yet.{canEdit ? " Add one using the row above." : ""}</div>
          )}
          {holidays && holidays.length > 0 && (
            <div>
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center gap-2 py-1 border-b border-brand-border last:border-0">
                  <span className="text-[12px] font-mono text-brand-sub w-[90px] flex-shrink-0">{h.date}</span>
                  <span className="flex-1 text-[12.5px] text-brand-text">{h.name}</span>
                  {canEdit && (
                    <button
                      onClick={() => (confirmingId === h.id ? deleteHoliday(h.id) : setConfirmingId(h.id))}
                      title={confirmingId === h.id ? "Click to confirm delete" : "Delete"}
                      className="text-brand-sub hover:text-red-600"
                    >
                      <Trash2 size={13} style={{ color: confirmingId === h.id ? "#C4443D" : undefined }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
