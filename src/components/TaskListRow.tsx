"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, Diamond, Copy, ChevronDown, ChevronRight, Paperclip, MessageSquare, ListChecks } from "lucide-react";
import type { Task, Project, AssigneeDisplay } from "@/types/models";
import { PRIORITIES, STATUSES, dueBadge, toneStyle, isBlocked, splitModules } from "@/lib/taskHelpers";
import AvatarStack from "./ui/AvatarStack";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface TaskListRowProps {
  task: Task;
  assignees: AssigneeDisplay[];
  project?: Project;
  allTasks: Task[];
  canManage: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** Nesting depth under a parent task — 0 for a top-level task. */
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  doneChildCount?: number;
  totalChildCount?: number;
  density?: "comfortable" | "compact";
}

export default function TaskListRow({
  task, assignees, project, allTasks, canManage, onEdit, onDelete, onDuplicate,
  selectMode, selected, onToggleSelect,
  depth = 0, hasChildren = false, collapsed = false, onToggleCollapse, doneChildCount = 0, totalChildCount = 0,
  density = "comfortable",
}: TaskListRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);
  const blocked = isBlocked(task, allTasks);
  const modules = splitModules(task.module);
  const compact = density === "compact";

  return (
    <div
      className={compact ? "bg-white border border-brand-border rounded-lg px-2.5 py-1 mb-1" : "bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-2"}
      style={{ borderRight: `4px solid ${priority.color}`, marginLeft: depth * 22 }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[180px]">
          {selectMode && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect?.(task.id)}
              className="flex-shrink-0"
            />
          )}
          {hasChildren && (
            <button
              onClick={() => onToggleCollapse?.(task.id)}
              title={collapsed ? "Expand subtasks" : "Collapse subtasks"}
              className="p-0.5 text-brand-sub flex-shrink-0"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <AvatarStack assignees={assignees} />
          {task.isMilestone && <Diamond size={12} className="text-brand-dark" />}
          {task.code && <span className="font-mono text-[11px] text-brand-sub">{task.code}</span>}
          <span className="font-semibold text-[13.5px] text-brand-text">{task.title}</span>
          {project && <Chip small style={{ background: "#EEF2F0", color: "#5B6B64" }}>{project.name}</Chip>}
          {modules.map((m) => (
            <Chip key={m} small style={{ background: "#E4EEF7", color: "#2A5C82" }}>{m}</Chip>
          ))}
          {task.tags.map((tag) => (
            <Chip key={tag} small style={{ background: "#EDE7F5", color: "#5B4A8A" }}>{tag}</Chip>
          ))}
          {hasChildren && (
            <Chip small style={{ background: "#EAF3EE", color: "#0A5A46" }}>
              {doneChildCount}/{totalChildCount} subtasks
            </Chip>
          )}
          {blocked && <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>Blocked</Chip>}
          {task.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-brand-sub"><Paperclip size={11} /> {task.attachmentCount}</span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-brand-sub"><MessageSquare size={11} /> {task.commentCount}</span>
          )}
          {task.checklistTotal > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-brand-sub"><ListChecks size={11} /> {task.checklistDone}/{task.checklistTotal}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
          {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
          {!selectMode && (
            <>
              <button onClick={() => onEdit(task)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-brand-sub">
                <Pencil size={14} />
              </button>
              {canManage && (
                <button
                  onClick={() => (confirmingDuplicate ? onDuplicate(task.id) : setConfirmingDuplicate(true))}
                  title={confirmingDuplicate ? "Click to confirm" : "Duplicate"}
                  className="p-1 rounded hover:bg-gray-100"
                  style={{ color: confirmingDuplicate ? "#0A5A46" : "#5B6B64" }}
                >
                  {confirmingDuplicate ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => (confirmingDelete ? onDelete(task.id) : setConfirmingDelete(true))}
                  title={confirmingDelete ? "Click to confirm" : "Move to Trash"}
                  className="p-1 rounded hover:bg-gray-100"
                  style={{ color: confirmingDelete ? "#C4443D" : "#5B6B64" }}
                >
                  {confirmingDelete ? <Check size={14} /> : <Trash2 size={14} />}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {!task.isMilestone && !compact && <ProgressBar value={task.progress} color={status.color} />}
    </div>
  );
}
