"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, ChevronLeft, ChevronRight, Diamond, AlertTriangle } from "lucide-react";
import type { Task, Project, AssigneeDisplay } from "@/types/models";
import { PRIORITIES, STATUSES, dueBadge, toneStyle, isBlocked } from "@/lib/taskHelpers";
import AvatarStack from "./ui/AvatarStack";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface TaskCardProps {
  task: Task;
  assignees: AssigneeDisplay[];
  project?: Project;
  allTasks: Task[];
  /** Whether this user can fully edit/delete THIS task (Super Admin, or project-admin of its project). */
  canManage: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onMove: (task: Task, dir: 1 | -1) => void;
  /** Bulk-select mode: shows a checkbox instead of the usual edit/delete affordances. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export default function TaskCard({
  task, assignees, project, allTasks, canManage, onEdit, onDelete, onMove,
  selectMode, selected, onToggleSelect,
}: TaskCardProps) {
  const [confirming, setConfirming] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);
  const statusIdx = STATUSES.findIndex((s) => s.id === task.status);
  const blocked = isBlocked(task, allTasks);

  return (
    <div
      className="bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-2.5"
      style={{ borderRight: `4px solid ${priority.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {selectMode && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect?.(task.id)}
              className="flex-shrink-0"
            />
          )}
          {task.isMilestone && <Diamond size={12} className="text-brand-dark flex-shrink-0" />}
          <div className="font-semibold text-[13.5px] text-brand-text leading-snug line-clamp-2" title={task.title}>
            {task.code && <span className="font-mono text-[11px] text-brand-sub mr-1">{task.code}</span>}
            {task.title}
          </div>
        </div>
        {!selectMode && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(task)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-brand-sub">
              <Pencil size={14} />
            </button>
            {canManage && (
              <button
                onClick={() => (confirming ? onDelete(task.id) : setConfirming(true))}
                title={confirming ? "Click to confirm" : "Move to Trash"}
                className="p-1 rounded hover:bg-gray-100"
                style={{ color: confirming ? "#C4443D" : "#5B6B64" }}
              >
                {confirming ? <Check size={14} /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        {project && <Chip small style={{ background: "#EEF2F0", color: "#5B6B64" }}>{project.name}</Chip>}
        {blocked && (
          <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Blocked</span>
          </Chip>
        )}
      </div>

      {!task.isMilestone && <ProgressBar value={task.progress} color={status.color} />}

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onMove(task, -1)}
            disabled={statusIdx === 0}
            title="Move to previous status"
            className="p-0.5"
            style={{ color: statusIdx === 0 ? "#D5DAD7" : "#5B6B64" }}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => onMove(task, 1)}
            disabled={statusIdx === STATUSES.length - 1}
            title="Move to next status"
            className="p-0.5"
            style={{ color: statusIdx === STATUSES.length - 1 ? "#D5DAD7" : "#5B6B64" }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
          <AvatarStack assignees={assignees} size={24} />
        </div>
      </div>
    </div>
  );
}
