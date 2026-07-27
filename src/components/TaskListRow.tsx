"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, Diamond } from "lucide-react";
import type { Task, Project, AssigneeDisplay } from "@/types/models";
import { PRIORITIES, STATUSES, dueBadge, toneStyle, isBlocked } from "@/lib/taskHelpers";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface TaskListRowProps {
  task: Task;
  assignee?: AssigneeDisplay;
  project?: Project;
  allTasks: Task[];
  canManage: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export default function TaskListRow({
  task, assignee, project, allTasks, canManage, onEdit, onDelete,
}: TaskListRowProps) {
  const [confirming, setConfirming] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);
  const blocked = isBlocked(task, allTasks);

  return (
    <div
      className="bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-2"
      style={{ borderRight: `4px solid ${priority.color}` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[180px]">
          <Avatar name={assignee?.name} color={assignee?.color} active={assignee?.active} kind={assignee?.kind} />
          {task.isMilestone && <Diamond size={12} className="text-brand-dark" />}
          {task.code && <span className="font-mono text-[11px] text-brand-sub">{task.code}</span>}
          <span className="font-semibold text-[13.5px] text-brand-text">{task.title}</span>
          {project && <Chip small style={{ background: "#EEF2F0", color: "#5B6B64" }}>{project.name}</Chip>}
          {blocked && <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>Blocked</Chip>}
        </div>
        <div className="flex items-center gap-2">
          <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
          {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
          <button onClick={() => onEdit(task)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-brand-sub">
            <Pencil size={14} />
          </button>
          {canManage && (
            <button
              onClick={() => (confirming ? onDelete(task.id) : setConfirming(true))}
              title={confirming ? "Click to confirm" : "Delete"}
              className="p-1 rounded hover:bg-gray-100"
              style={{ color: confirming ? "#C4443D" : "#5B6B64" }}
            >
              {confirming ? <Check size={14} /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </div>
      {!task.isMilestone && <ProgressBar value={task.progress} color={status.color} />}
    </div>
  );
}
