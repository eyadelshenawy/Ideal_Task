"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, ChevronLeft, ChevronRight, Diamond, AlertTriangle, Copy, Paperclip, MessageSquare, ListChecks } from "lucide-react";
import type { Task, Project, AssigneeDisplay } from "@/types/models";
import { PRIORITIES, STATUSES, dueBadge, toneStyle, isBlocked, splitModules } from "@/lib/taskHelpers";
import AvatarStack from "./ui/AvatarStack";
import Chip from "./ui/Chip";
import SlaChip from "./SlaChip";
import TicketTypeChip from "./TicketTypeChip";
import type { TaskSla } from "@/lib/taskSla";
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
  onDuplicate: (id: string) => void;
  /** Bulk-select mode: shows a checkbox instead of the usual edit/delete affordances. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** Board drag-and-drop: this card is the drag source. */
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  /** Human-readable "starts before predecessor finishes" label — chip is only shown when set. */
  dependencyWarning?: string | null;
  /** SLA status when the task is in an SLA-tracked project. */
  sla?: TaskSla | null;
  /** "Category › Subcategory" label, if set. */
  categoryName?: string | null;
}

export default function TaskCard({
  task, assignees, project, allTasks, canManage, onEdit, onDelete, onMove, onDuplicate,
  selectMode, selected, onToggleSelect, draggable, onDragStart, dependencyWarning, sla, categoryName,
}: TaskCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);
  const statusIdx = STATUSES.findIndex((s) => s.id === task.status);
  const blocked = isBlocked(task, allTasks);
  const parent = task.parentId ? allTasks.find((t) => t.id === task.parentId) : undefined;
  const children = allTasks.filter((t) => t.parentId === task.id);
  const doneChildren = children.filter((t) => t.status === "DONE").length;
  const modules = splitModules(task.module);
  // Project, modules, category, tags and parent/subtask info share one quiet grey line.
  const meta = [
    project?.name,
    ...modules,
    categoryName,
    ...task.tags.map((tag) => `#${tag}`),
    parent ? `↳ ${parent.code || parent.title}` : null,
    children.length > 0 ? `${doneChildren}/${children.length} subtasks` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(task.id)}
      className="group bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-2.5"
      style={{ borderRight: `4px solid ${priority.color}`, cursor: draggable ? "grab" : undefined }}
    >
      <div className="flex items-center justify-between gap-2 min-h-[22px]">
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
          {task.code && <span className="font-mono text-[11px] text-brand-sub truncate">{task.code}</span>}
        </div>
        {!selectMode && (
          // On a computer the icons appear when the mouse is over the card; touch screens always show them.
          <div
            className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
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

      <div className="font-semibold text-[13.5px] text-brand-text leading-snug line-clamp-2" title={task.title}>
        {task.title}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <TicketTypeChip type={task.type} />
        {sla && task.status !== "DONE" && <SlaChip sla={sla} />}
        {blocked && (
          <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Blocked</span>
          </Chip>
        )}
      </div>

      {meta.length > 0 && (
        <div className="mt-1.5 text-[11.5px] text-brand-sub leading-snug">{meta.join(" · ")}</div>
      )}

      {!task.isMilestone && <ProgressBar value={task.progress} color={status.color} />}

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-2.5 text-[11px] text-brand-sub">
          {/* Status arrows only on touch screens — on a computer, drag the card instead. */}
          <div className="flex items-center gap-0.5 [@media(hover:hover)]:hidden">
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
          {task.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5"><Paperclip size={11} /> {task.attachmentCount}</span>
          )}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5"><MessageSquare size={11} /> {task.commentCount}</span>
          )}
          {task.checklistTotal > 0 && (
            <span className="flex items-center gap-0.5"><ListChecks size={11} /> {task.checklistDone}/{task.checklistTotal}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
          {dependencyWarning && (
            <span title={dependencyWarning}>
              <Chip small style={{ background: "#FBEEDD", color: "#8A5A20" }}>
                <AlertTriangle size={9} style={{ display: "inline", marginRight: 3 }} />Dep
              </Chip>
            </span>
          )}
          <AvatarStack assignees={assignees} size={24} />
        </div>
      </div>
    </div>
  );
}
