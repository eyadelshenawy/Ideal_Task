"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { Task, TeamMember } from "@/types/models";
import { todayStr } from "@/lib/taskHelpers";

interface Row {
  key: number;
  taskId: string;
  date: string;
  hours: string;
  note: string;
}

interface Props {
  tasks: Task[];
  team: TeamMember[];
  isSuperAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
}

let rowIdSeq = 1;
function newRow(): Row {
  return { key: rowIdSeq++, taskId: "", date: todayStr(), hours: "", note: "" };
}

export default function BulkTimeModal({ tasks, team, isSuperAdmin, currentUserId, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [logForUserId, setLogForUserId] = useState<string>(currentUserId);
  const [taskFilter, setTaskFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const activeTeam = team.filter((m) => m.active);
  const openTasks = tasks.filter((t) => t.status !== "DONE");
  const q = taskFilter.trim().toLowerCase();
  const filteredTasks = q
    ? openTasks.filter((t) => t.title.toLowerCase().includes(q) || (t.code ?? "").toLowerCase().includes(q))
    : openTasks;

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  async function submit() {
    const filled = rows.filter((r) => r.taskId && Number(r.hours) > 0);
    if (filled.length === 0) {
      setError("Fill in at least one row (task + hours)");
      return;
    }
    setError("");
    setSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < filled.length; i++) {
      const r = filled[i];
      setProgress(`Logging ${i + 1} / ${filled.length}…`);
      const body: Record<string, unknown> = {
        hours: Number(r.hours),
        date: r.date,
        note: r.note.trim() || undefined,
      };
      if (isSuperAdmin && logForUserId && logForUserId !== currentUserId) body.userId = logForUserId;
      try {
        const res = await fetch(`/api/tasks/${r.taskId}/time`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setSubmitting(false);
    setProgress("");
    if (fail > 0) {
      setError(`Logged ${ok}, failed ${fail}. Check the failed rows and try again.`);
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Log time in bulk</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isSuperAdmin && activeTeam.length > 1 && (
            <>
              <label className="text-[11.5px] text-brand-sub">Log for:</label>
              <select
                value={logForUserId}
                onChange={(e) => setLogForUserId(e.target.value)}
                className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none bg-white"
              >
                {activeTeam.map((m) => (
                  <option key={m.id} value={m.id}>{m.id === currentUserId ? "Me" : m.name}</option>
                ))}
              </select>
            </>
          )}
          <input
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
            placeholder="Filter tasks in the dropdown"
            className="flex-1 min-w-[180px] rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5 mb-3">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-1.5">
              <select
                value={r.taskId}
                onChange={(e) => updateRow(r.key, { taskId: e.target.value })}
                className="flex-1 min-w-[220px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none bg-white"
              >
                <option value="">-- pick a task --</option>
                {filteredTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.code ? `${t.code} · ${t.title}` : t.title}</option>
                ))}
              </select>
              <input
                type="date"
                value={r.date}
                onChange={(e) => updateRow(r.key, { date: e.target.value })}
                className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
              />
              <input
                type="number" min="0.25" step="0.25"
                value={r.hours}
                onChange={(e) => updateRow(r.key, { hours: e.target.value })}
                placeholder="Hours"
                className="w-[80px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
              />
              <input
                value={r.note}
                onChange={(e) => updateRow(r.key, { note: e.target.value })}
                placeholder="Note (optional)"
                className="flex-1 min-w-[120px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
              />
              <button
                onClick={() => removeRow(r.key)}
                disabled={rows.length === 1}
                className="p-1 rounded text-brand-sub hover:bg-gray-100 disabled:opacity-30"
                title="Remove row"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="flex items-center gap-1 text-[11.5px] font-semibold text-brand-dark hover:underline mb-3"
        >
          <Plus size={12} /> Add row
        </button>

        {error && <div className="text-[11.5px] text-red-600 mb-2">{error}</div>}
        {progress && <div className="text-[11.5px] text-brand-sub mb-2">{progress}</div>}

        <div className="flex gap-1.5 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-sub hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
          >
            {submitting ? "Logging…" : "Log all"}
          </button>
        </div>
      </div>
    </div>
  );
}
