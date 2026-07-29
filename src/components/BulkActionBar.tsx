"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Project, Status, TeamMember } from "@/types/models";
import { STATUSES } from "@/lib/taskHelpers";

interface BulkActionBarProps {
  selectedCount: number;
  team: TeamMember[];
  projects: Project[];
  onClear: () => void;
  onSetStatus: (status: Status) => Promise<void>;
  onSetAssignee: (userId: string) => Promise<void>;
  onSetProject: (projectId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function BulkActionBar({
  selectedCount, team, projects, onClear, onSetStatus, onSetAssignee, onSetProject, onDelete,
}: BulkActionBarProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap rounded-lg px-3 py-2 mb-3 bg-brand-dark text-white">
      <span className="text-xs font-semibold">{selectedCount} selected</span>

      <select
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const status = e.target.value as Status;
          e.target.value = "";
          if (status) run(() => onSetStatus(status));
        }}
        className="rounded-md px-2 py-1 text-xs text-brand-text"
      >
        <option value="" disabled>Set status…</option>
        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>

      <select
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const userId = e.target.value;
          e.target.value = "";
          if (userId) run(() => onSetAssignee(userId));
        }}
        className="rounded-md px-2 py-1 text-xs text-brand-text"
      >
        <option value="" disabled>Set assignee…</option>
        {team.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <select
        disabled={busy}
        defaultValue=""
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = "";
          if (value) run(() => onSetProject(value === "__none__" ? null : value));
        }}
        className="rounded-md px-2 py-1 text-xs text-brand-text"
      >
        <option value="" disabled>Move to project…</option>
        <option value="__none__">No project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <button
        disabled={busy}
        onClick={() => (confirming ? run(onDelete) : setConfirming(true))}
        className="rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{ background: confirming ? "#C4443D" : "rgba(255,255,255,0.15)" }}
      >
        {confirming ? "Click to confirm delete" : "Move to Trash"}
      </button>

      {busy && <Loader2 size={14} className="animate-spin" />}

      <button onClick={onClear} disabled={busy} className="ml-auto p-1 rounded hover:bg-white/10" title="Clear selection">
        <X size={14} />
      </button>
    </div>
  );
}
