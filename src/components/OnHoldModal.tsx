"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, RotateCcw } from "lucide-react";
import { api } from "@/lib/apiClient";

interface OnHoldTask {
  id: string;
  code: string | null;
  title: string;
  status: string;
  parentId: string | null;
  onHoldAt: string;
  projectId: string | null;
  projectName: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load");
    return r.json();
  });

function since(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "since today";
  if (days === 1) return "for 1 day";
  return `for ${days} days`;
}

/**
 * Settings → On hold: every parked task, grouped by project. Bringing a task
 * back also brings its subtasks; in an SLA project its Due Date moves on by
 * the working days it was on hold.
 */
export default function OnHoldModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<OnHoldTask[]>("/api/tasks/hold", fetcher);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function bringBack(body: { taskIds?: string[]; projectId?: string }) {
    setBusy(true);
    setError("");
    try {
      await api.holdTasks({ hold: false, ...body });
      await mutate();
      onChanged();
    } catch {
      setError("Couldn't bring these back — please try again");
    } finally {
      setBusy(false);
    }
  }

  const tasks = data ?? [];
  // Subtasks come back with their main task, so only top-level parked tasks get a button.
  const heldIds = new Set(tasks.map((t) => t.id));
  const groups = new Map<string, { name: string; projectId: string | null; tasks: OnHoldTask[] }>();
  for (const t of tasks) {
    const key = t.projectId ?? "__none__";
    const g = groups.get(key) ?? { name: t.projectName, projectId: t.projectId, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[480px] h-full sm:h-auto max-h-none sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">On hold</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Tasks parked until something is settled (for example a client agreement). They are hidden from the lists,
          counts, reports, SLA alerts and reminders. Bringing one back brings its subtasks too, and in an SLA project
          its Due Date moves on by the working days it was on hold.
        </div>
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        {!data ? (
          <div className="text-center text-brand-sub text-sm py-8">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="text-center text-brand-sub text-sm py-8">Nothing is on hold</div>
        ) : (
          <div className="space-y-4">
            {[...groups.values()].map((g) => (
              <div key={g.projectId ?? "none"}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-semibold text-[12px] text-brand-sub">{g.name} ({g.tasks.length})</div>
                  {g.projectId && (
                    <button
                      onClick={() => bringBack({ projectId: g.projectId! })}
                      disabled={busy}
                      className="flex items-center gap-1 text-[11.5px] font-semibold text-brand-dark disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> Bring back all
                    </button>
                  )}
                </div>
                <div className="border border-brand-border rounded-lg divide-y divide-brand-border">
                  {g.tasks.map((t) => {
                    const isSub = !!t.parentId && heldIds.has(t.parentId);
                    return (
                      <div key={t.id} className={`flex items-center gap-2 px-2.5 py-2 text-[12.5px] ${isSub ? "pl-6" : ""}`}>
                        <span className="font-mono text-[11px] text-brand-sub whitespace-nowrap">{t.code}</span>
                        <span className="flex-1 min-w-0 truncate text-brand-text" title={t.title}>{t.title}</span>
                        <span className="text-[10.5px] text-brand-sub whitespace-nowrap">{since(t.onHoldAt)}</span>
                        {!isSub && (
                          <button
                            onClick={() => bringBack({ taskIds: [t.id] })}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11.5px] font-semibold text-brand-dark whitespace-nowrap disabled:opacity-50"
                          >
                            <RotateCcw size={12} /> Bring back
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
