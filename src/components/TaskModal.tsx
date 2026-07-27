"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Task, Project, TeamMember, Contact, Priority, Status } from "@/types/models";
import { PRIORITIES, STATUSES } from "@/lib/taskHelpers";

export type AssigneeEntry = { type: "user" | "contact"; id: string };

export interface TaskDraft {
  id?: string;
  code: string;
  title: string;
  description: string;
  projectId: string;
  assignees: AssigneeEntry[];
  priority: Priority;
  status: Status;
  startDate: string;
  dueDate: string;
  progress: number;
  isMilestone: boolean;
  dependsOn: string[];
}

export function blankDraft(): TaskDraft {
  return {
    code: "", title: "", description: "", projectId: "", assignees: [],
    priority: "MEDIUM", status: "TODO", startDate: "", dueDate: "",
    progress: 0, isMilestone: false, dependsOn: [],
  };
}

export function draftFromTask(task: Task): TaskDraft {
  return {
    id: task.id,
    code: task.code ?? "",
    title: task.title,
    description: task.description ?? "",
    projectId: task.projectId ?? "",
    assignees: [
      ...task.assigneeIds.map((id): AssigneeEntry => ({ type: "user", id })),
      ...task.contactAssigneeIds.map((id): AssigneeEntry => ({ type: "contact", id })),
    ],
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    progress: task.progress,
    isMilestone: task.isMilestone,
    dependsOn: task.dependsOn,
  };
}

interface TaskModalProps {
  draft: TaskDraft;
  setDraft: (d: TaskDraft) => void;
  onClose: () => void;
  onSave: () => void;
  error?: string;
  team: TeamMember[];
  projects: Project[];
  contacts: Contact[];
  allTasks: Task[];
  /** Full create/edit form vs the Status+Progress-only form. */
  canFullyEdit: boolean;
  /** Super Admins get an unrestricted "No project" option; Project Admins must pick one of their administered projects (already pre-filtered into `projects`). */
  isSuperAdmin: boolean;
  onCreateContact: (name: string) => Promise<Contact | null>;
}

export default function TaskModal({
  draft, setDraft, onClose, onSave, error, team, projects, contacts, allTasks, canFullyEdit, isSuperAdmin, onCreateContact,
}: TaskModalProps) {
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [contactError, setContactError] = useState("");

  const activeMembers = team.filter((m) => m.active);
  const inactiveMembers = team.filter((m) => !m.active);
  const otherTasks = allTasks.filter((t) => t.id !== draft.id);

  function isAssigned(type: AssigneeEntry["type"], id: string) {
    return draft.assignees.some((a) => a.type === type && a.id === id);
  }

  function toggleAssignee(type: AssigneeEntry["type"], id: string) {
    setDraft({
      ...draft,
      assignees: isAssigned(type, id)
        ? draft.assignees.filter((a) => !(a.type === type && a.id === id))
        : [...draft.assignees, { type, id }],
    });
  }

  async function submitNewContact() {
    if (!newContactName.trim()) return;
    setContactError("");
    const contact = await onCreateContact(newContactName.trim());
    if (!contact) {
      setContactError("Couldn't add contact");
      return;
    }
    setDraft({ ...draft, assignees: [...draft.assignees, { type: "contact", id: contact.id }] });
    setNewContactName("");
    setAddingContact(false);
  }

  function toggleDepend(id: string) {
    setDraft({
      ...draft,
      dependsOn: draft.dependsOn.includes(id) ? draft.dependsOn.filter((d) => d !== id) : [...draft.dependsOn, id],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[16px] text-brand-text">
            {draft.id ? (canFullyEdit ? "Edit Task" : "Update Status") : "New Task"}
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        {!canFullyEdit ? (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-semibold text-brand-sub">Task</div>
              <div className="text-sm text-brand-text mt-1">
                {draft.code && <span className="font-mono text-xs text-brand-sub mr-1">{draft.code}</span>}
                {draft.title}
              </div>
              {draft.description && <div className="text-xs text-brand-sub mt-1">{draft.description}</div>}
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
            {!draft.isMilestone && (
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
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="w-[90px] flex-shrink-0">
                <label className="text-xs font-semibold text-brand-sub">Code</label>
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="e.g. IDT-01"
                  className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none font-mono"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-sub">Title *</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Task name"
                  className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
                />
              </div>
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
              <label className="text-xs font-semibold text-brand-sub">Project{!isSuperAdmin && " *"}</label>
              <select
                value={draft.projectId}
                onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                {isSuperAdmin && <option value="">No project</option>}
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!isSuperAdmin && (
                <div className="text-[11px] text-brand-sub mt-1">
                  You can only create tasks in projects you administer.
                </div>
              )}
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

            <div>
              <label className="text-xs font-semibold text-brand-sub">Assignees</label>
              <div className="border border-brand-border rounded-[10px] max-h-[160px] overflow-y-auto p-2 mt-1">
                {activeMembers.length === 0 && inactiveMembers.length === 0 && contacts.length === 0 && (
                  <div className="text-xs text-brand-sub">No team members or contacts yet</div>
                )}
                {activeMembers.length > 0 && (
                  <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide mt-0.5 mb-0.5">Team</div>
                )}
                {activeMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs py-0.5 text-brand-text">
                    <input type="checkbox" checked={isAssigned("user", m.id)} onChange={() => toggleAssignee("user", m.id)} />
                    {m.name}
                  </label>
                ))}
                {inactiveMembers.length > 0 && (
                  <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide mt-1.5 mb-0.5">Inactive</div>
                )}
                {inactiveMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs py-0.5 text-brand-text">
                    <input type="checkbox" checked={isAssigned("user", m.id)} onChange={() => toggleAssignee("user", m.id)} />
                    {m.name}
                  </label>
                ))}
                {contacts.length > 0 && (
                  <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide mt-1.5 mb-0.5">External contacts</div>
                )}
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs py-0.5 text-brand-text">
                    <input type="checkbox" checked={isAssigned("contact", c.id)} onChange={() => toggleAssignee("contact", c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
              {!addingContact ? (
                <button
                  type="button"
                  onClick={() => setAddingContact(true)}
                  className="text-[11px] text-brand-dark underline mt-1"
                >
                  + New external contact
                </button>
              ) : (
                <div className="flex gap-1 mt-1">
                  <input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Contact name"
                    className="flex-1 min-w-0 rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={submitNewContact}
                    className="rounded-lg px-2 text-xs font-semibold bg-brand-dark text-white flex-shrink-0"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingContact(false); setNewContactName(""); setContactError(""); }}
                    className="text-xs text-brand-sub px-1 flex-shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {contactError && <div className="text-[11px] text-red-600 mt-1">{contactError}</div>}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-brand-sub">
              <input
                type="checkbox"
                checked={draft.isMilestone}
                onChange={(e) => setDraft({ ...draft, isMilestone: e.target.checked })}
              />
              This is a milestone (single-date marker, no duration)
            </label>

            <div className="grid grid-cols-2 gap-3">
              {!draft.isMilestone && (
                <div>
                  <label className="text-xs font-semibold text-brand-sub">Start Date</label>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                    className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-brand-sub">
                  {draft.isMilestone ? "Milestone Date" : "Due Date"}
                </label>
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

            {!draft.isMilestone && (
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
            )}

            <div>
              <label className="text-xs font-semibold text-brand-sub">Depends on (predecessor tasks)</label>
              <div className="border border-brand-border rounded-[10px] max-h-[120px] overflow-y-auto p-2 mt-1">
                {otherTasks.length === 0 && <div className="text-xs text-brand-sub">No other tasks yet</div>}
                {otherTasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs py-0.5 text-brand-text">
                    <input
                      type="checkbox"
                      checked={draft.dependsOn.includes(t.id)}
                      onChange={() => toggleDepend(t.id)}
                    />
                    {t.title}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button onClick={onSave} className="flex-1 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold">
            Save
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-brand-border text-brand-text py-2.5 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
