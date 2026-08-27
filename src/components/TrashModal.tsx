"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, RotateCcw, Trash2, Check } from "lucide-react";

interface TrashedTaskEntry {
  id: string;
  code: string | null;
  title: string;
  projectId: string | null;
  projectName: string | null;
  deletedAt: string;
}

interface TrashedProjectEntry {
  id: string;
  name: string;
  deletedAt: string;
}

interface TrashData {
  tasks: TrashedTaskEntry[];
  projects: TrashedProjectEntry[];
}

interface TrashModalProps {
  isSuperAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load");
    return r.json();
  });

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function TrashModal({ isSuperAdmin, onClose, onChanged }: TrashModalProps) {
  const { data, mutate } = useSWR<TrashData>("/api/trash", fetcher);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const [error, setError] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [restoringBulk, setRestoringBulk] = useState(false);

  async function restoreTask(id: string) {
    setError("");
    const res = await fetch(`/api/tasks/${id}/restore`, { method: "POST" });
    if (!res.ok) {
      setError("Couldn't restore this task");
      return;
    }
    await mutate();
    onChanged();
  }

  async function restoreSelected() {
    if (selectedTaskIds.size === 0) return;
    setError("");
    setRestoringBulk(true);
    try {
      // One request per task — no server-side batch endpoint yet, and the
      // trash view is bounded (30-day retention) so this stays cheap.
      const results = await Promise.all(
        Array.from(selectedTaskIds).map((id) => fetch(`/api/tasks/${id}/restore`, { method: "POST" }))
      );
      const failedCount = results.filter((r) => !r.ok).length;
      if (failedCount > 0) setError(`Couldn't restore ${failedCount} of ${results.length} — the rest were restored.`);
      setSelectedTaskIds(new Set());
      await mutate();
      onChanged();
    } finally {
      setRestoringBulk(false);
    }
  }

  function toggleTaskSelected(id: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function restoreProject(id: string) {
    setError("");
    const res = await fetch(`/api/projects/${id}/restore`, { method: "POST" });
    if (!res.ok) {
      setError("Couldn't restore this project");
      return;
    }
    await mutate();
    onChanged();
  }

  async function emptyTrash() {
    setError("");
    const res = await fetch("/api/trash", { method: "DELETE" });
    setConfirmingEmpty(false);
    if (!res.ok) {
      setError("Couldn't empty Trash");
      return;
    }
    await mutate();
    onChanged();
  }

  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];
  const isEmpty = tasks.length === 0 && projects.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Trash</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Deleted tasks and projects are kept here for 30 days.
          {isSuperAdmin && " Empty Trash to remove them for good."}
        </div>
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        {!data ? (
          <div className="text-center text-brand-sub text-sm py-8">Loading…</div>
        ) : isEmpty ? (
          <div className="text-center text-brand-sub text-sm py-8">Trash is empty</div>
        ) : (
          <div className="space-y-4">
            {tasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-semibold text-[12px] text-brand-sub">Tasks ({tasks.length})</div>
                  {selectedTaskIds.size > 0 && (
                    <button
                      onClick={restoreSelected}
                      disabled={restoringBulk}
                      className="flex items-center gap-1 text-[11.5px] font-semibold text-brand-dark"
                      style={{ opacity: restoringBulk ? 0.5 : 1 }}
                    >
                      <RotateCcw size={12} /> Restore {selectedTaskIds.size} selected
                    </button>
                  )}
                </div>
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-brand-border">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(t.id)}
                      onChange={() => toggleTaskSelected(t.id)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-brand-text truncate">{t.title}</div>
                      <div className="text-[11px] text-brand-sub">
                        {t.projectName ? `${t.projectName} · ` : ""}Deleted {timeAgo(t.deletedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreTask(t.id)}
                      title="Restore"
                      className="p-1.5 rounded hover:bg-gray-100 text-brand-dark flex items-center gap-1"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isSuperAdmin && projects.length > 0 && (
              <div>
                <div className="font-semibold text-[12px] text-brand-sub mb-1.5">Projects ({projects.length})</div>
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-brand-border">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-brand-text truncate">{p.name}</div>
                      <div className="text-[11px] text-brand-sub">Deleted {timeAgo(p.deletedAt)}</div>
                    </div>
                    <button
                      onClick={() => restoreProject(p.id)}
                      title="Restore"
                      className="p-1.5 rounded hover:bg-gray-100 text-brand-dark flex items-center gap-1"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isSuperAdmin && !isEmpty && (
          <button
            onClick={() => (confirmingEmpty ? emptyTrash() : setConfirmingEmpty(true))}
            className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{
              background: confirmingEmpty ? "#C4443D" : "#FBE7E5",
              color: confirmingEmpty ? "#fff" : "#9A3530",
            }}
          >
            {confirmingEmpty ? <Check size={14} /> : <Trash2 size={14} />}
            {confirmingEmpty ? "Click to confirm — this can't be undone" : "Empty Trash"}
          </button>
        )}
      </div>
    </div>
  );
}
