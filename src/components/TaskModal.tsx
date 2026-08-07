"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Task, Project, TeamMember, Contact, Priority, Status, RecurrenceFreq } from "@/types/models";
import { PRIORITIES, STATUSES, descendantIds, splitModules } from "@/lib/taskHelpers";
import TaskActivityPanel from "./TaskActivityPanel";
import TaskChecklistPanel from "./TaskChecklistPanel";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import TaskTimePanel from "./TaskTimePanel";
import TaskCustomFieldsPanel from "./TaskCustomFieldsPanel";

export type AssigneeEntry = { type: "user" | "contact"; id: string };

export interface TaskDraft {
  id?: string;
  code: string;
  title: string;
  description: string;
  module: string;
  projectId: string;
  assignees: AssigneeEntry[];
  priority: Priority;
  status: Status;
  startDate: string;
  dueDate: string;
  completedAt: string;
  progress: number;
  isMilestone: boolean;
  dependsOn: string[];
  recurrenceFreq: RecurrenceFreq | "";
  recurrenceEndDate: string;
  tags: string[];
  parentId: string;
}

export function blankDraft(): TaskDraft {
  return {
    code: "", title: "", description: "", module: "", projectId: "", assignees: [],
    priority: "MEDIUM", status: "TODO", startDate: "", dueDate: "", completedAt: "",
    progress: 0, isMilestone: false, dependsOn: [],
    recurrenceFreq: "", recurrenceEndDate: "", tags: [], parentId: "",
  };
}

export function draftFromTask(task: Task): TaskDraft {
  return {
    id: task.id,
    code: task.code ?? "",
    title: task.title,
    description: task.description ?? "",
    module: task.module ?? "",
    projectId: task.projectId ?? "",
    assignees: [
      ...task.assigneeIds.map((id): AssigneeEntry => ({ type: "user", id })),
      ...task.contactAssigneeIds.map((id): AssigneeEntry => ({ type: "contact", id })),
    ],
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    completedAt: task.completedAt ?? "",
    progress: task.progress,
    isMilestone: task.isMilestone,
    dependsOn: task.dependsOn,
    recurrenceFreq: task.recurrenceFreq ?? "",
    recurrenceEndDate: task.recurrenceEndDate ?? "",
    tags: task.tags,
    parentId: task.parentId ?? "",
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
  /** Project Admins must pick one of their administered projects (already pre-filtered into `projects`); Super Admins can pick any. */
  isSuperAdmin: boolean;
  currentUserId?: string;
  onCreateContact: (name: string) => Promise<Contact | null>;
  onDuplicate?: (taskId: string, projectId?: string) => void;
  onAddSubtask?: (parent: Task) => void;
}

export default function TaskModal({
  draft, setDraft, onClose, onSave, error, team, projects, contacts, allTasks, canFullyEdit, isSuperAdmin, currentUserId, onCreateContact, onDuplicate, onAddSubtask,
}: TaskModalProps) {
  const [duplicateProjectId, setDuplicateProjectId] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [contactError, setContactError] = useState("");
  const [newTagText, setNewTagText] = useState("");
  const [newModuleText, setNewModuleText] = useState("");

  function addTag() {
    const name = newTagText.trim();
    if (!name || draft.tags.includes(name)) { setNewTagText(""); return; }
    setDraft({ ...draft, tags: [...draft.tags, name] });
    setNewTagText("");
  }

  function removeTag(name: string) {
    setDraft({ ...draft, tags: draft.tags.filter((t) => t !== name) });
  }

  // Module is stored as a single comma-separated string ("FICO, MM"), edited
  // here as add/remove chips the same way Tags works below.
  const moduleList = splitModules(draft.module);
  function addModule() {
    const name = newModuleText.trim();
    if (!name || moduleList.includes(name)) { setNewModuleText(""); return; }
    setDraft({ ...draft, module: [...moduleList, name].join(", ") });
    setNewModuleText("");
  }
  function removeModule(name: string) {
    setDraft({ ...draft, module: moduleList.filter((m) => m !== name).join(", ") });
  }

  const activeMembers = team.filter((m) => m.active);
  const inactiveMembers = team.filter((m) => !m.active);
  // Only tasks in the same project make sense as a predecessor — cuts a
  // list of everything down to something actually findable.
  const otherTasks = allTasks.filter((t) => t.id !== draft.id && t.projectId === draft.projectId);
  // A task can't become its own parent, nor a parent of one of its own
  // descendants (that would create a cycle) — server re-checks this too.
  const excludedAsParent = draft.id ? descendantIds(draft.id, allTasks) : new Set<string>();
  const parentCandidates = otherTasks.filter((t) => !excludedAsParent.has(t.id));

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

  function selectParent(parentId: string) {
    const parent = parentId ? otherTasks.find((t) => t.id === parentId) : undefined;
    // Same "soft suggestion, never overwrite a manual edit" rule as the
    // project-code suggestion below — only fills in a still-blank Code.
    const suggestCode = !draft.id && !draft.code.trim() && parent?.code;
    setDraft({
      ...draft,
      parentId,
      ...(suggestCode ? { code: `${parent!.code}-${String(parent!.childCodeSeq + 1).padStart(2, "0")}` } : {}),
    });
  }

  function toggleDepend(id: string) {
    const adding = !draft.dependsOn.includes(id);
    // Soft suggestion only: picking a predecessor fills in this task's Start
    // Date from its Due Date, if Start Date is still blank — never overwrites
    // a date already set.
    const predecessor = adding ? otherTasks.find((t) => t.id === id) : undefined;
    const suggestedStart = adding && predecessor?.dueDate && !draft.startDate ? predecessor.dueDate : undefined;
    setDraft({
      ...draft,
      dependsOn: adding ? [...draft.dependsOn, id] : draft.dependsOn.filter((d) => d !== id),
      ...(suggestedStart ? { startDate: suggestedStart } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[460px] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-brand-border flex-shrink-0">
          <h2 className="font-bold text-[16px] text-brand-text">
            {draft.id ? (canFullyEdit ? "Edit Task" : "Update Status") : "New Task"}
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
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
              {draft.status === "DONE" && draft.completedAt && (
                <div className="text-[11px] text-brand-sub mt-1">Completed on {draft.completedAt}</div>
              )}
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
              <div className="w-[110px] flex-shrink-0">
                <label className="text-xs font-semibold text-brand-sub">Code *</label>
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="e.g. APEX-0001"
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
              <label className="text-xs font-semibold text-brand-sub">Module</label>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {moduleList.map((m) => (
                  <span key={m} className="flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px]" style={{ background: "#E4EEF7", color: "#2A5C82" }}>
                    {m}
                    <button type="button" onClick={() => removeModule(m)} className="hover:opacity-70">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={newModuleText}
                  onChange={(e) => setNewModuleText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModule(); } }}
                  onBlur={addModule}
                  placeholder="e.g. Billing, Auth — press Enter (optional)"
                  className="flex-1 min-w-[100px] rounded-lg border border-brand-border px-2 py-1 text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Project *</label>
              <select
                value={draft.projectId}
                onChange={(e) => {
                  const projectId = e.target.value;
                  const project = projects.find((p) => p.id === projectId);
                  // Only auto-suggest a code for a brand-new task whose Code
                  // field is still untouched — never overwrite a manual edit
                  // or an existing task's real code.
                  const suggestCode = !draft.id && !draft.code.trim() && project;
                  setDraft({
                    ...draft,
                    projectId,
                    ...(suggestCode ? { code: `${project.code}-${String(project.taskCodeSeq + 1).padStart(4, "0")}` } : {}),
                  });
                }}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                <option value="" disabled>Select a project…</option>
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
              <label className="text-xs font-semibold text-brand-sub">Tags</label>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {draft.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] bg-brand-bg text-brand-text border border-brand-border">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="text-brand-sub hover:text-brand-text">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  onBlur={addTag}
                  placeholder="Type a tag, press Enter…"
                  className="flex-1 min-w-[100px] rounded-lg border border-brand-border px-2 py-1 text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Assignees *</label>
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
                  <label className="text-xs font-semibold text-brand-sub">Start Date *</label>
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
                  {draft.isMilestone ? "Milestone Date *" : "Due Date *"}
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

            {draft.status === "DONE" && (
              <div>
                <label className="text-xs font-semibold text-brand-sub">Completed Date</label>
                <input
                  type="date"
                  value={draft.completedAt}
                  onChange={(e) => setDraft({ ...draft, completedAt: e.target.value })}
                  className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                />
                <div className="text-[11px] text-brand-sub mt-1">Auto-set to today when moved to Done — edit if it actually finished on a different day.</div>
              </div>
            )}

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
              <label className="text-xs font-semibold text-brand-sub">Repeat</label>
              <div className="flex gap-2 mt-1">
                <select
                  value={draft.recurrenceFreq}
                  onChange={(e) => setDraft({ ...draft, recurrenceFreq: e.target.value as RecurrenceFreq | "" })}
                  className="flex-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                >
                  <option value="">Doesn&apos;t repeat</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                {draft.recurrenceFreq && (
                  <input
                    type="date"
                    value={draft.recurrenceEndDate}
                    onChange={(e) => setDraft({ ...draft, recurrenceEndDate: e.target.value })}
                    title="Stop repeating after (optional)"
                    className="flex-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
                  />
                )}
              </div>
              {draft.recurrenceFreq && (
                <div className="text-[11px] text-brand-sub mt-1">
                  Marking this task Done will auto-create the next occurrence, due one {draft.recurrenceFreq === "DAILY" ? "day" : draft.recurrenceFreq === "WEEKLY" ? "week" : "month"} after this one{draft.recurrenceEndDate ? ` (until ${draft.recurrenceEndDate})` : ""}.
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Depends on (predecessor tasks)</label>
              <div className="border border-brand-border rounded-[10px] max-h-[120px] overflow-y-auto p-2 mt-1">
                {otherTasks.length === 0 && (
                  <div className="text-xs text-brand-sub">
                    {draft.projectId ? "No other tasks in this project yet" : "Pick a project first"}
                  </div>
                )}
                {otherTasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs py-0.5 text-brand-text">
                    <input
                      type="checkbox"
                      checked={draft.dependsOn.includes(t.id)}
                      onChange={() => toggleDepend(t.id)}
                    />
                    {t.code && <span className="font-mono text-[11px] text-brand-sub">{t.code}</span>}
                    {t.title}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Parent task (make this a subtask)</label>
              <select
                value={draft.parentId}
                onChange={(e) => selectParent(e.target.value)}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              >
                <option value="">No parent — top-level task</option>
                {parentCandidates.map((t) => (
                  <option key={t.id} value={t.id}>{t.code ? `${t.code} — ` : ""}{t.title}</option>
                ))}
              </select>
              {draft.parentId && (
                <div className="text-[11px] text-brand-sub mt-1">
                  Lives under its parent in List view; auto-marks the parent Done once every subtask is.
                </div>
              )}
            </div>
          </div>
        )}

        {draft.id && onDuplicate && (
          <div className="flex items-center gap-1.5 mt-3">
            <select
              value={duplicateProjectId}
              onChange={(e) => setDuplicateProjectId(e.target.value)}
              className="flex-1 rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
            >
              <option value="">Duplicate into same project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>Duplicate into {p.name}</option>)}
            </select>
            <button
              onClick={() => onDuplicate(draft.id!, duplicateProjectId || undefined)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-brand-border text-brand-text"
            >
              Duplicate
            </button>
          </div>
        )}

        {draft.id && canFullyEdit && onAddSubtask && (() => {
          const thisTask = allTasks.find((t) => t.id === draft.id);
          if (!thisTask) return null;
          return (
            <button
              onClick={() => onAddSubtask(thisTask)}
              className="w-full mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold border border-brand-border text-brand-text"
            >
              + Add subtask under this task
            </button>
          );
        })()}

        {draft.id && draft.projectId && <TaskCustomFieldsPanel taskId={draft.id} />}
        {draft.id && <TaskChecklistPanel taskId={draft.id} />}
        {draft.id && <TaskTimePanel taskId={draft.id} currentUserId={currentUserId} isSuperAdmin={isSuperAdmin} />}
        {draft.id && <TaskAttachmentsPanel taskId={draft.id} />}
        {draft.id && <TaskActivityPanel taskId={draft.id} currentUserId={currentUserId} isSuperAdmin={isSuperAdmin} />}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-brand-border flex-shrink-0">
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
