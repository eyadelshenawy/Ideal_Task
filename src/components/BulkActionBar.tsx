"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Check, MoreHorizontal } from "lucide-react";
import type { Project, Status, TeamMember } from "@/types/models";
import { STATUSES } from "@/lib/taskHelpers";

interface BulkActionBarProps {
  selectedCount: number;
  totalVisible: number;
  // False for members with no project-admin grants: hides the actions the
  // API would silently skip for them anyway (assignee, project, More…, and
  // Move to Trash), leaving just status / Mark Done — the only things they
  // can actually apply across the selection.
  canManageAny: boolean;
  team: TeamMember[];
  projects: Project[];
  onClear: () => void;
  onSelectAll: () => void;
  onBulkUpdate: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function BulkActionBar({
  selectedCount, totalVisible, canManageAny, team, projects, onClear, onSelectAll, onBulkUpdate, onDelete,
}: BulkActionBarProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // The More popover has its own field-level state so a user can fill a
  // date/tag/module and Apply it, without every keystroke triggering an API
  // call — unlike the top-level dropdowns which fire on change.
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [progress, setProgress] = useState("");
  const [module, setModule] = useState("");
  const [addTag, setAddTag] = useState("");
  const [removeTag, setRemoveTag] = useState("");

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOpen]);

  async function run(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await onBulkUpdate(patch);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function applyMore(patch: Record<string, unknown>, reset: () => void) {
    if (Object.keys(patch).length === 0) return;
    await run(patch);
    reset();
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap rounded-lg px-3 py-2 mb-3 bg-brand-dark text-white">
      <span className="text-xs font-semibold">{selectedCount} of {totalVisible} selected</span>
      <button
        onClick={selectedCount === totalVisible && totalVisible > 0 ? onClear : onSelectAll}
        disabled={busy || totalVisible === 0}
        className="rounded-md px-2 py-1 text-[11px] font-semibold bg-white/15"
        title={selectedCount === totalVisible ? "Deselect all" : "Select every visible task"}
      >
        {selectedCount === totalVisible && totalVisible > 0 ? "Deselect all" : "Select all"}
      </button>

      <select
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const status = e.target.value as Status;
          e.target.value = "";
          if (status) run({ status });
        }}
        className="rounded-md px-2 py-1 text-xs text-brand-text"
      >
        <option value="" disabled>Set status…</option>
        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      {canManageAny && (
        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            const userId = e.target.value;
            e.target.value = "";
            if (userId) run({ assignees: [{ type: "user", id: userId }] });
          }}
          className="rounded-md px-2 py-1 text-xs text-brand-text"
        >
          <option value="" disabled>Set assignee…</option>
          {team.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}

      {canManageAny && (
        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value;
            e.target.value = "";
            if (value) run({ projectId: value === "__none__" ? null : value });
          }}
          className="rounded-md px-2 py-1 text-xs text-brand-text"
        >
          <option value="" disabled>Move to project…</option>
          <option value="__none__">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      <button
        disabled={busy}
        onClick={() => run({ status: "DONE" })}
        className="rounded-md px-2.5 py-1 text-xs font-semibold bg-white/15"
        title="Mark selected as Done"
      >
        <Check size={12} className="inline mr-1" />Mark Done
      </button>

      {canManageAny && (
      <div ref={moreRef} className="relative">
        <button
          disabled={busy}
          onClick={() => setMoreOpen((v) => !v)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold bg-white/15 flex items-center gap-1"
        >
          <MoreHorizontal size={12} /> More…
        </button>
        {moreOpen && (
          <div
            className="absolute z-30 top-full mt-1 right-0 rounded-lg p-3 bg-white border border-brand-border shadow-lg text-brand-text"
            style={{ minWidth: 260 }}
          >
            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Priority</label>
            <select
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value;
                e.target.value = "";
                if (value) run({ priority: value });
              }}
              className="w-full rounded-md px-2 py-1 text-xs border border-brand-border mb-3"
            >
              <option value="" disabled>Set priority…</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Start date</label>
            <div className="flex gap-1 mb-3">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => applyMore({ startDate: startDate || null }, () => setStartDate(""))}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Apply
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Due date</label>
            <div className="flex gap-1 mb-3">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => applyMore({ dueDate: dueDate || null }, () => setDueDate(""))}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Apply
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Progress %</label>
            <div className="flex gap-1 mb-3">
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => {
                  const n = Number(progress);
                  if (Number.isFinite(n) && n >= 0 && n <= 100) applyMore({ progress: n }, () => setProgress(""));
                }}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Apply
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Module</label>
            <div className="flex gap-1 mb-3">
              <input
                type="text"
                placeholder="e.g. FICO"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => applyMore({ module: module.trim() || null }, () => setModule(""))}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Apply
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Add tag</label>
            <div className="flex gap-1 mb-3">
              <input
                type="text"
                placeholder="tag name"
                value={addTag}
                onChange={(e) => setAddTag(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => addTag.trim() && applyMore({ addTag: addTag.trim() }, () => setAddTag(""))}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Add
              </button>
            </div>

            <label className="block text-[11px] font-semibold text-brand-sub mb-1">Remove tag</label>
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="tag name"
                value={removeTag}
                onChange={(e) => setRemoveTag(e.target.value)}
                className="flex-1 rounded-md px-2 py-1 text-xs border border-brand-border"
              />
              <button
                onClick={() => removeTag.trim() && applyMore({ removeTag: removeTag.trim() }, () => setRemoveTag(""))}
                className="rounded-md px-2 py-1 text-[11px] font-semibold bg-brand-dark text-white"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {canManageAny && (
      <button
        disabled={busy}
        onClick={async () => {
          if (!confirming) { setConfirming(true); return; }
          setBusy(true);
          try { await onDelete(); } finally { setBusy(false); setConfirming(false); }
        }}
        className="rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{ background: confirming ? "#C4443D" : "rgba(255,255,255,0.15)" }}
      >
        {confirming ? "Click to confirm delete" : "Move to Trash"}
      </button>
      )}

      {busy && <Loader2 size={14} className="animate-spin" />}

      <button onClick={onClear} disabled={busy} className="ml-auto p-1 rounded hover:bg-white/10" title="Clear selection">
        <X size={14} />
      </button>
    </div>
  );
}
