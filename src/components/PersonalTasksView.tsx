"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Lock, Trash2, Check } from "lucide-react";
import type { Task } from "@/types/models";
import { STATUSES, PRIORITIES, dueBadge, toneStyle } from "@/lib/taskHelpers";
import { api } from "@/lib/apiClient";
import PersonalTaskModal, { blankPersonalDraft, personalDraftFromTask, type PersonalTaskDraft } from "./PersonalTaskModal";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function PersonalCard({ task, onEdit, onDelete }: { task: Task; onEdit: (t: Task) => void; onDelete: (id: string) => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const priority = PRIORITIES.find((p) => p.id === task.priority)!;
  const status = STATUSES.find((s) => s.id === task.status)!;
  const badge = dueBadge(task);

  return (
    <div
      onClick={() => onEdit(task)}
      className="bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-2.5 cursor-pointer"
      style={{ borderRight: `4px solid ${priority.color}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-[13.5px] text-brand-text leading-snug">{task.title}</div>
        <button
          onClick={(e) => { e.stopPropagation(); confirmingDelete ? onDelete(task.id) : setConfirmingDelete(true); }}
          title={confirmingDelete ? "Click to confirm" : "Delete"}
          className="p-1 rounded hover:bg-gray-100 flex-shrink-0"
          style={{ color: confirmingDelete ? "#C4443D" : "#5B6B64" }}
        >
          {confirmingDelete ? <Check size={14} /> : <Trash2 size={14} />}
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
        {badge && <Chip small style={toneStyle(badge.tone)}>{badge.label}</Chip>}
      </div>
      <ProgressBar value={task.progress} color={status.color} />
    </div>
  );
}

export default function PersonalTasksView({ currentUserId }: { currentUserId: string }) {
  const { data: tasks, mutate } = useSWR<Task[]>("/api/tasks/personal", fetcher);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<PersonalTaskDraft>(blankPersonalDraft());
  const [formError, setFormError] = useState("");

  const taskList = tasks ?? [];

  function openNew() {
    setDraft(blankPersonalDraft());
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(task: Task) {
    setDraft(personalDraftFromTask(task));
    setFormError("");
    setModalOpen(true);
  }

  async function saveDraft() {
    if (!draft.title.trim()) {
      setFormError("Title is required");
      return;
    }
    try {
      const payload = {
        title: draft.title, description: draft.description, priority: draft.priority, status: draft.status,
        startDate: draft.startDate || null, dueDate: draft.dueDate || null, progress: draft.progress,
      };
      if (draft.id) {
        await api.updateTask(draft.id, payload);
      } else {
        await api.createPersonalTask(payload);
      }
      await mutate();
      setModalOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save task");
    }
  }

  async function deleteTask(id: string) {
    await api.deleteTask(id);
    await mutate();
    setModalOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs text-brand-sub">
          <Lock size={13} /> Only you can see these tasks
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-dark text-white"
        >
          <Plus size={14} /> New Personal Task
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUSES.map((status) => {
          const colTasks = taskList.filter((t) => t.status === status.id);
          return (
            <div key={status.id} style={{ minWidth: 250, width: 250, flexShrink: 0 }}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-2 h-2 rounded-full" style={{ background: status.color }} />
                <span className="font-bold text-[12.5px] text-brand-text">{status.label}</span>
                <span className="text-brand-sub text-[11.5px]">({colTasks.length})</span>
              </div>
              <div style={{ minHeight: 40 }}>
                {colTasks.length === 0 && (
                  <div className="text-center text-[12px] py-[18px] rounded-[10px] border border-dashed border-brand-border" style={{ color: "#B7C0BB" }}>
                    No tasks
                  </div>
                )}
                {colTasks.map((task) => (
                  <PersonalCard key={task.id} task={task} onEdit={openEdit} onDelete={deleteTask} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <PersonalTaskModal
          draft={draft}
          setDraft={setDraft}
          onClose={() => setModalOpen(false)}
          onSave={saveDraft}
          onDelete={draft.id ? deleteTask : undefined}
          error={formError}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
