"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, Diamond, Copy, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import type { Task, Project, AssigneeDisplay, Status } from "@/types/models";
import { PRIORITIES, STATUSES, dueBadge, toneStyle, isBlocked, splitModules } from "@/lib/taskHelpers";
import AvatarStack from "./ui/AvatarStack";
import Chip from "./ui/Chip";
import SlaChip from "./SlaChip";
import TicketTypeChip from "./TicketTypeChip";
import type { TaskSla } from "@/lib/taskSla";

interface TaskListRowProps {
  task: Task;
  assignees: AssigneeDisplay[];
  project?: Project;
  allTasks: Task[];
  canManage: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onChangeStatus: (task: Task, status: Status) => void;
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
  /** Human-readable "starts before predecessor finishes" label — chip is only shown when set. */
  dependencyWarning?: string | null;
  /** SLA status when the task is in an SLA-tracked project. */
  sla?: TaskSla | null;
  /** "Category › Subcategory" label, if set. */
  categoryName?: string | null;
}

export default function TaskListRow({
  task, assignees, project, allTasks, canManage, onEdit, onDelete, onDuplicate, onChangeStatus,
  selectMode, selected, onToggleSelect,
  depth = 0, hasChildren = false, collapsed = false, onToggleCollapse, doneChildCount = 0, totalChildCount = 0,
  density = "comfortable", dependencyWarning, sla, categoryName,
}: TaskListRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);
  const blocked = isBlocked(task, allTasks);
  const modules = splitModules(task.module);
  const compact = density === "compact";

  // Project, modules, category, tags, subtask progress and counts share one quiet grey run of text.
  const meta = [
    project?.name,
    ...modules,
    categoryName,
    ...task.tags.map((tag) => `#${tag}`),
    hasChildren ? `${doneChildCount}/${totalChildCount} subtasks` : null,
    task.commentCount > 0 ? `${task.commentCount} comment${task.commentCount === 1 ? "" : "s"}` : null,
    task.attachmentCount > 0 ? `${task.attachmentCount} file${task.attachmentCount === 1 ? "" : "s"}` : null,
    task.checklistTotal > 0 ? `${task.checklistDone}/${task.checklistTotal} checklist` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`group relative overflow-hidden bg-white border border-brand-border ${compact ? "rounded-lg px-2.5 py-1 mb-1" : "rounded-[10px] px-3 py-2.5 mb-1.5"}`}
      style={{ borderRight: `4px solid ${priority.color}`, marginLeft: depth * 22 }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-1 min-w-[180px] sm:min-w-0">
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
          <div className="flex-shrink-0 sm:w-[46px]"><AvatarStack assignees={assignees} /></div>
          {task.isMilestone && <Diamond size={12} className="text-brand-dark flex-shrink-0" />}
          {task.code && <span className="font-mono text-[11px] text-brand-sub flex-shrink-0 sm:min-w-[92px]">{task.code}</span>}
          <span className="flex-shrink-0 sm:w-[36px]"><TicketTypeChip type={task.type} /></span>
          <span className="font-semibold text-[13.5px] text-brand-text sm:truncate sm:flex-shrink-0 sm:max-w-[45%]" title={task.title}>{task.title}</span>
          {blocked && <span className="flex-shrink-0"><Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>Blocked</Chip></span>}
          {meta.length > 0 && (
            <span className="text-[12px] text-brand-sub sm:truncate min-w-0" title={meta.join(" · ")}><span className="hidden sm:inline">· </span>{meta.join(" · ")}</span>
          )}
        </div>
        {/* Fixed-width slots keep status, SLA and due date lined up from row to row. */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
          {dependencyWarning && (
            <span title={dependencyWarning}>
              <Chip small style={{ background: "#FBEEDD", color: "#8A5A20" }}>
                <AlertTriangle size={9} style={{ display: "inline", marginRight: 3 }} />Dep
              </Chip>
            </span>
          )}
          <select
            value={task.status}
            onChange={(e) => onChangeStatus(task, e.target.value as Status)}
            title="Change status"
            className="rounded-full text-[11px] font-medium border-none outline-none px-2 py-0.5 cursor-pointer sm:w-[112px]"
            style={{ background: status.color + "22", color: status.color }}
          >
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="hidden sm:flex justify-center w-[128px]">{sla && task.status !== "DONE" && <SlaChip sla={sla} />}</span>
          {sla && task.status !== "DONE" && <span className="sm:hidden"><SlaChip sla={sla} /></span>}
          <span className="sm:w-[84px] flex sm:justify-center">{badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}</span>
          {!selectMode && (
            // On a computer the icons appear when the mouse is over the row; touch screens always show them.
            <div
              className={`flex items-center gap-1 transition-opacity ${
                confirmingDelete || confirmingDuplicate
                  ? ""
                  : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
            >
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
            </div>
          )}
        </div>
      </div>
      {/* Progress runs as a thin line along the bottom edge instead of taking its own row. */}
      {!task.isMilestone && !compact && (
        <div className="absolute left-0 bottom-0 h-[3px]" style={{ width: `${task.progress || 0}%`, background: status.color }} />
      )}
    </div>
  );
}
