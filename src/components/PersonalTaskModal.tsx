"use client";

import { X, Lock } from "lucide-react";
import type { Task, Priority, Status } from "@/types/models";
import { PRIORITIES, STATUSES } from "@/lib/taskHelpers";
import TaskActivityPanel from "./TaskActivityPanel";
import TaskChecklistPanel from "./TaskChecklistPanel";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";

export interface PersonalTaskDraft {
  id?: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  startDate: string;
  dueDate: string;
  progress: number;
}

export function blankPersonalDraft(): PersonalTaskDraft {
  return { title: "", description: "", priority: "MEDIUM", status: "TODO", startDate: "", dueDate: "", progress: 0 };
}

export function personalDraftFromTask(task: Task): PersonalTaskDraft {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    progress: task.progress,
  };
}

interface PersonalTaskModalProps {
  draft: PersonalTaskDraft;
  setDraft: (d: PersonalTaskDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: (id: string) => void;
  error?: string;
  currentUserId?: string;
}

export default function PersonalTaskModal({ draft, setDraft, onClose, onSave, onDelete, error, currentUserId }: PersonalTaskModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-brand-border flex-shrink-0">
          <h2 className="flex items-center gap-1.5 font-bold text-[16px] text-brand-text">
            <Lock size={14} className="text-brand-sub" />
            {draft.id ? "Edit Personal Task" : "New Personal Task"}
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            <div className="text-[11px] text-brand-sub bg-brand-bg rounded-lg px-2.5 py-1.5">
              Only you can see this task — not other team members, not other Super Admins.
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Title *</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Task name"
                className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
              />
            </div>
            {error && <div className="text-xs -mt-2 text-red-600">{error}</div>}

            <div>
              <label className="text-xs font-semibold text-brand-sub">Description</label>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                placeholder="Optional details"
                className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Priority</label>
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-brand-sub">Start Date</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-sub">Due Date</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Status</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold flex items-center justify-between text-brand-sub">
                <span>Progress</span><span>{draft.progress || 0}%</span>
              </label>
              <input
                type="range" min={0} max={100} step={5}
                value={draft.progress || 0}
                onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
                className="w-full mt-1"
              />
            </div>
          </div>

          {draft.id && <TaskChecklistPanel taskId={draft.id} />}
          {draft.id && <TaskAttachmentsPanel taskId={draft.id} />}
          {draft.id && <TaskActivityPanel taskId={draft.id} currentUserId={currentUserId} isSuperAdmin={false} />}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-brand-border flex-shrink-0">
          <button onClick={onSave} className="flex-1 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold">
            Save
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-brand-border text-brand-text py-2.5 text-sm font-semibold">
            Cancel
          </button>
          {draft.id && onDelete && (
            <button
              onClick={() => onDelete(draft.id!)}
              title="Delete"
              className="rounded-lg border border-brand-border text-red-600 py-2.5 px-3 text-sm font-semibold"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
