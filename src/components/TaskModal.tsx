"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import type { Task, Project, TeamMember, Contact, Priority, Status, RecurrenceFreq, TicketType, MatrixLevel, Category } from "@/types/models";
import { PRIORITIES, STATUSES, descendantIds, splitModules, formatDateDisplay } from "@/lib/taskHelpers";
import { TICKET_TYPES, MATRIX_LEVELS, priorityFromMatrix } from "@/lib/ticketMeta";
import { MODULE_OPTIONS } from "@/lib/listConfig";
import type { TaskSla } from "@/lib/taskSla";
import SlaStatusPanel from "./SlaStatusPanel";
import SlaChip from "./SlaChip";
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
  type: TicketType;
  impact: MatrixLevel | "";
  urgency: MatrixLevel | "";
  categoryId: string;
  subcategoryId: string;
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
  durationDays: string;
}

export function blankDraft(): TaskDraft {
  return {
    code: "", title: "", description: "", module: "", projectId: "", assignees: [],
    priority: "MEDIUM", status: "TODO", type: "TASK", impact: "", urgency: "", categoryId: "", subcategoryId: "",
    startDate: "", dueDate: "", completedAt: "",
    progress: 0, isMilestone: false, dependsOn: [],
    recurrenceFreq: "", recurrenceEndDate: "", tags: [], parentId: "", durationDays: "",
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
    type: task.type,
    impact: task.impact ?? "",
    urgency: task.urgency ?? "",
    categoryId: task.categoryId ?? "",
    subcategoryId: task.subcategoryId ?? "",
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
    durationDays: task.durationDays !== null ? String(task.durationDays) : "",
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
  onCreateContact: (name: string, projectId: string | null) => Promise<Contact | null>;
  onDuplicate?: (taskId: string, projectId?: string) => void;
  onAddSubtask?: (parent: Task) => void;
  categories: Category[];
  /** SLA status of the task being edited; null/undefined when it isn't SLA-tracked. */
  sla?: TaskSla | null;
}

export default function TaskModal({
  draft, setDraft, onClose, onSave, error, team, projects, contacts, allTasks, canFullyEdit, isSuperAdmin, currentUserId, onCreateContact, onDuplicate, onAddSubtask,
  categories, sla,
}: TaskModalProps) {
  const topCategories = categories.filter((c) => !c.parentId);
  const subcategories = categories.filter((c) => c.parentId && c.parentId === draft.categoryId);

  // Picking both Impact and Urgency fills Priority from the matrix; the
  // Priority dropdown stays editable for a manual override.
  function setMatrix(patch: { impact?: MatrixLevel | ""; urgency?: MatrixLevel | "" }) {
    const impact = patch.impact !== undefined ? patch.impact : draft.impact;
    const urgency = patch.urgency !== undefined ? patch.urgency : draft.urgency;
    const fromMatrix = priorityFromMatrix(impact || null, urgency || null);
    setDraft({ ...draft, impact, urgency, ...(fromMatrix ? { priority: fromMatrix } : {}) });
  }
  const matrixPriority = priorityFromMatrix(draft.impact || null, draft.urgency || null);
  const [duplicateProjectId, setDuplicateProjectId] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [contactError, setContactError] = useState("");
  const [newTagText, setNewTagText] = useState("");
  // Existing tasks open on a tabbed layout; a new task only has Details.
  const [tab, setTab] = useState<"details" | "checklist" | "time" | "files" | "comments">("details");
  // Description starts at 4 lines and grows with the text up to ~12 lines, then scrolls.
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight + 2, 260)}px`;
  }, [draft.description, tab]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);
  // A save error is shown on Details, so jump there when one arrives.
  useEffect(() => { if (error) setTab("details"); }, [error]);

  // SLA-driven Duration auto-fill for tasks in an SLA-tracked project.
  // Rules (in order of who wins):
  //   1. Priority change is authoritative — the SLA class of the task is
  //      whatever priority it now carries, so Duration gets rewritten from
  //      the project's SLA numbers even if the user typed one earlier.
  //      Escalating from Low to Critical MUST tighten the deadline.
  //   2. First-time entry into an SLA project (project just picked, no prior
  //      duration in the draft) also fills Duration.
  //   3. Any manual edit the user makes AFTER the auto-fill sticks until the
  //      priority is changed again — the effect below never overwrites a
  //      value the user just typed, because it only fires on
  //      priority/project changes, not on every Duration keystroke.
  // Non-SLA projects (project.sla === null) are left alone entirely.
  const prevKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${draft.projectId}|${draft.priority}`;
    if (prevKeyRef.current === key) return;
    const isInitialLoad = prevKeyRef.current === "";
    prevKeyRef.current = key;

    const project = projects.find((p) => p.id === draft.projectId);
    if (!project?.sla) return;
    const days = project.sla[draft.priority];
    if (!days) return;

    // A milestone is a single date — no Duration to fill.
    if (draft.isMilestone) return;
    // Opening a task never stomps on its dates: an existing task keeps what it
    // has (even with no Duration, e.g. Due only), and a new one pre-filled with
    // a Duration keeps it. Auto-fill only kicks in when priority or project
    // actually change from what they were.
    if (isInitialLoad && (draft.id || draft.durationDays)) return;

    setDraft({ ...draft, durationDays: String(days), dueDate: "" });
    // The setDraft closure captures the current draft; this is intentional —
    // deps only fire on the two fields we actually key off, so the write is
    // a one-shot per change and won't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.projectId, draft.priority, projects]);

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
  function addModule(name: string) {
    if (!name || moduleList.includes(name)) return;
    setDraft({ ...draft, module: [...moduleList, name].join(", ") });
  }
  // Only active modules can be picked; hidden ones already on the task stay
  // as chips until removed.
  const modulesToAdd = MODULE_OPTIONS.filter((m) => m.active && !moduleList.includes(m.name));
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

  // Only this task's own project's contacts are offered — a contact tied to
  // a different client shouldn't be assignable here. Already-assigned
  // contacts stay visible even if their project no longer matches (project
  // changed after the fact, or a legacy contact with no project at all).
  const projectContacts = contacts.filter((c) => c.projectId === draft.projectId || isAssigned("contact", c.id));

  function assigneeName(a: AssigneeEntry) {
    return a.type === "user" ? team.find((m) => m.id === a.id)?.name ?? "Unknown" : contacts.find((c) => c.id === a.id)?.name ?? "Unknown";
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
    const contact = await onCreateContact(newContactName.trim(), draft.projectId || null);
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
    // A new subtask with no dates yet starts with its main task's dates.
    const suggestDates = !draft.id && !draft.startDate && !draft.dueDate && parent && (parent.startDate || parent.dueDate);
    setDraft({
      ...draft,
      parentId,
      ...(suggestDates ? {
        startDate: parent!.startDate ?? "",
        dueDate: parent!.dueDate ?? "",
        durationDays: parent!.durationDays !== null ? String(parent!.durationDays) : "",
      } : {}),
      ...(suggestCode ? { code: `${parent!.code}-${String(parent!.childCodeSeq + 1).padStart(2, "0")}` } : {}),
    });
  }

  function toggleDepend(id: string) {
    const adding = !draft.dependsOn.includes(id);
    // Soft suggestion only: picking a predecessor fills in this task's Start
    // Date from its Due Date, if Start Date is still blank — never overwrites
    // a date already set.
    const predecessor = adding ? otherTasks.find((t) => t.id === id) : undefined;
    const suggestedStart = adding && !draft.isMilestone && predecessor?.dueDate && !draft.startDate ? predecessor.dueDate : undefined;
    setDraft({
      ...draft,
      dependsOn: adding ? [...draft.dependsOn, id] : draft.dependsOn.filter((d) => d !== id),
      ...(suggestedStart ? { startDate: suggestedStart } : {}),
    });
  }

  const savedTask = draft.id ? allTasks.find((t) => t.id === draft.id) : undefined;
  // A main task's progress is the average of its subtasks, worked out when a subtask changes.
  const progressFromSubtasks = !!draft.id && allTasks.some((t) => t.parentId === draft.id);
  const levelLabel = (v: MatrixLevel | "") => MATRIX_LEVELS.find((l) => l.value === v)?.label;
  // Tab panels drop their own divider line, since the tab bar already separates them.
  const panelWrap = "[&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0";
  const field = "w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none";
  const tabs = [
    { id: "details" as const, label: "Details" },
    { id: "checklist" as const, label: "Checklist", count: savedTask?.checklistTotal ? `${savedTask.checklistDone}/${savedTask.checklistTotal}` : "" },
    { id: "time" as const, label: "Time" },
    { id: "files" as const, label: "Files", count: savedTask?.attachmentCount ? String(savedTask.attachmentCount) : "" },
    { id: "comments" as const, label: "Comments", count: savedTask?.commentCount ? String(savedTask.commentCount) : "" },
  ];

  // Status, progress and the SLA countdown — the things changed most often — sit together at the top.
  const statusStrip = (
    <div className="rounded-[10px] bg-brand-bg p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
          aria-label="Status"
          className="rounded-lg border border-brand-border bg-white px-2 py-1.5 text-sm outline-none"
        >
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {!draft.isMilestone && (
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <input
              type="range" min={0} max={100} step={5}
              value={draft.progress || 0}
              onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
              disabled={progressFromSubtasks}
              title={progressFromSubtasks ? "Set by its subtasks (average)" : undefined}
              aria-label="Progress"
              className="flex-1 disabled:opacity-60"
            />
            <span className="text-[11px] text-brand-sub w-8 text-right">{draft.progress || 0}%</span>
            {progressFromSubtasks && <span className="text-[10.5px] text-brand-sub w-full">Set by its subtasks (average).</span>}
          </div>
        )}
        {sla && (
          <button type="button" onClick={() => setSlaOpen(!slaOpen)} title="Show SLA details">
            <SlaChip sla={sla} />
          </button>
        )}
      </div>
      {sla && slaOpen && <div className="mt-2"><SlaStatusPanel sla={sla} /></div>}
      {draft.status === "DONE" && (canFullyEdit ? (
        <div className="mt-2">
          <label className="text-xs font-semibold text-brand-sub">Completed Date</label>
          <input
            type="date"
            value={draft.completedAt}
            onChange={(e) => setDraft({ ...draft, completedAt: e.target.value })}
            className={`${field} bg-white`}
          />
          <div className="text-[11px] text-brand-sub mt-1">Auto-set to today when moved to Done — edit if it actually finished on a different day.</div>
        </div>
      ) : draft.completedAt && (
        <div className="text-[11px] text-brand-sub mt-1.5">Completed on {draft.completedAt}</div>
      ))}
    </div>
  );

  // The server assigns the code on save; only a Super Admin can change it
  // afterwards (under More options), everyone else sees it greyed out.
  const codeField = (
    <div>
      <label className="text-xs font-semibold text-brand-sub">Code</label>
      <input
        value={draft.code}
        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
        readOnly={!isSuperAdmin}
        placeholder="e.g. APEX-0001"
        title={isSuperAdmin ? undefined : "Only a Super Admin can change the code"}
        className={`${field} font-mono ${isSuperAdmin ? "" : "bg-brand-bg text-brand-sub cursor-not-allowed"}`}
      />
      {!isSuperAdmin && <div className="text-[10.5px] text-brand-sub mt-1">Only a Super Admin can change the code.</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      {/* An open task keeps one fixed height, so switching tabs doesn't make the window jump. */}
      <div className={`bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[460px] h-full ${draft.id ? "sm:h-[90vh]" : "sm:h-auto"} max-h-none sm:max-h-[90vh] flex flex-col`}>
        <div className={`px-5 pt-5 flex-shrink-0 border-b border-brand-border ${draft.id ? "" : "pb-4"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-[16px] text-brand-text leading-snug">
                {draft.id ? (savedTask?.title || draft.title || "Edit Task") : "New Task"}
              </h2>
              {draft.id && draft.code && <div className="font-mono text-[11.5px] text-brand-sub mt-0.5">{draft.code}</div>}
            </div>
            <button onClick={onClose} className="text-brand-sub flex-shrink-0"><X size={18} /></button>
          </div>
          {draft.id && (
            <div className="flex gap-1 mt-2 -mb-px overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1 px-2.5 py-2 text-[12.5px] whitespace-nowrap border-b-2 ${tab === t.id ? "border-brand-dark text-brand-dark font-bold" : "border-transparent text-brand-sub"}`}
                >
                  {t.label}
                  {t.count && <span className="rounded-md bg-brand-bg px-1.5 text-[10.5px] font-semibold text-brand-sub">{t.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className={tab === "details" ? "" : "hidden"}>
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
            {statusStrip}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* A new task always starts as New, 0% — status and progress appear once it's saved. */}
            {draft.id && statusStrip}

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-sub flex justify-between">
                  Title *
                  {!draft.id && <span className="font-normal">Code assigned on save</span>}
                </label>
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
              <label className="text-xs font-semibold text-brand-sub">Description *</label>
              <textarea
                ref={descriptionRef}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={4}
                placeholder="What's needed?"
                className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none resize-none overflow-y-auto"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className={field}
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
                <label className="text-xs font-semibold text-brand-sub">Module</label>
                <div className="flex items-center gap-1 flex-wrap mt-1 rounded-lg border border-brand-border px-1.5 py-1 min-h-[38px]">
                  {moduleList.map((m) => (
                    <span key={m} className="flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px]" style={{ background: "#E4EEF7", color: "#2A5C82" }}>
                      {m}
                      <button type="button" onClick={() => removeModule(m)} className="hover:opacity-70">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => addModule(e.target.value)}
                    className="flex-1 min-w-[70px] bg-transparent px-1 py-1 text-xs outline-none"
                  >
                    <option value="">{modulesToAdd.length ? (moduleList.length ? "Add…" : "Add a module… (optional)") : "No more modules in the list"}</option>
                    {modulesToAdd.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-sub">Type</label>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as TicketType })}
                  className={field}
                >
                  {TICKET_TYPES.filter((t) => t.active || t.value === draft.type).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-brand-sub">Category</label>
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value, subcategoryId: "" })}
                  className={field}
                >
                  <option value="">—</option>
                  {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {subcategories.length > 0 && (
                <div className="flex-1">
                  <label className="text-xs font-semibold text-brand-sub">Subcategory</label>
                  <select
                    value={draft.subcategoryId}
                    onChange={(e) => setDraft({ ...draft, subcategoryId: e.target.value })}
                    className={field}
                  >
                    <option value="">—</option>
                    {subcategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-brand-sub">Priority *</label>
                  <select
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
                    className={field}
                  >
                    {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                {/* Impact and Urgency stay one click away; picking both still fills Priority. */}
                <div className="flex-1 text-[11.5px] text-brand-sub sm:pb-2.5">
                  {draft.impact && draft.urgency ? `${levelLabel(draft.impact)} impact × ${levelLabel(draft.urgency)} urgency ` : "Set from Impact × Urgency "}
                  <button type="button" onClick={() => setMatrixOpen(!matrixOpen)} className="text-brand-dark underline">
                    {matrixOpen ? "hide" : draft.impact || draft.urgency ? "change" : "pick"}
                  </button>
                </div>
              </div>
              {matrixOpen && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-brand-sub">Impact</label>
                    <select
                      value={draft.impact}
                      onChange={(e) => setMatrix({ impact: e.target.value as MatrixLevel | "" })}
                      className={field}
                    >
                      <option value="">—</option>
                      {MATRIX_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-brand-sub">Urgency</label>
                    <select
                      value={draft.urgency}
                      onChange={(e) => setMatrix({ urgency: e.target.value as MatrixLevel | "" })}
                      className={field}
                    >
                      <option value="">—</option>
                      {MATRIX_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {matrixPriority && matrixPriority !== draft.priority && (
                <div className="text-[11px] text-brand-sub mt-1">
                  Matrix suggests {PRIORITIES.find((p) => p.id === matrixPriority)?.label} — priority was changed by hand.
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-sub">Assignees *</label>
              <div className="flex items-center gap-1 flex-wrap mt-1 rounded-lg border border-brand-border px-1.5 py-1 min-h-[38px]">
                {draft.assignees.map((a) => (
                  <span key={`${a.type}-${a.id}`} className="flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px]" style={{ background: "#EAF3EE", color: "#0A5A46" }}>
                    {assigneeName(a)}
                    <button type="button" onClick={() => toggleAssignee(a.type, a.id)} className="hover:opacity-70">
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => {
                    const [type, id] = e.target.value.split(":") as [AssigneeEntry["type"], string];
                    if (id) toggleAssignee(type, id);
                  }}
                  className="flex-1 min-w-[90px] bg-transparent px-1 py-1 text-xs outline-none"
                >
                  <option value="">
                    {activeMembers.length === 0 && inactiveMembers.length === 0 && projectContacts.length === 0
                      ? "No team members or contacts yet"
                      : draft.assignees.length ? "Add…" : "Pick who works on it…"}
                  </option>
                  {activeMembers.some((m) => !isAssigned("user", m.id)) && (
                    <optgroup label="Team">
                      {activeMembers.filter((m) => !isAssigned("user", m.id)).map((m) => <option key={m.id} value={`user:${m.id}`}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {inactiveMembers.some((m) => !isAssigned("user", m.id)) && (
                    <optgroup label="Inactive">
                      {inactiveMembers.filter((m) => !isAssigned("user", m.id)).map((m) => <option key={m.id} value={`user:${m.id}`}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {projectContacts.some((c) => !isAssigned("contact", c.id)) && (
                    <optgroup label="External contacts">
                      {projectContacts.filter((c) => !isAssigned("contact", c.id)).map((c) => <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
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

            <div className={draft.isMilestone ? "" : "grid grid-cols-1 sm:grid-cols-3 gap-3"}>
              {!draft.isMilestone && (
                <div>
                  <label className="text-xs font-semibold text-brand-sub">Start Date *</label>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value, dueDate: "" })}
                    className={field}
                  />
                </div>
              )}
              {!draft.isMilestone && (
                <div>
                  <label className="text-xs font-semibold text-brand-sub" title="Working days between Start and Due. Fills in Due automatically.">
                    Duration (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 5"
                    value={draft.durationDays}
                    onChange={(e) => setDraft({ ...draft, durationDays: e.target.value, dueDate: "" })}
                    className={field}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-brand-sub">
                  {draft.isMilestone ? "Milestone Date *" : "Due Date"}
                </label>
                {(() => {
                  // A milestone with subtasks takes its date from the latest subtask due.
                  const fromSubtasks = draft.isMilestone && !!draft.id && allTasks.some((t) => t.parentId === draft.id);
                  return (
                    <>
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(e) => setDraft({ ...draft, dueDate: e.target.value, durationDays: "" })}
                        readOnly={fromSubtasks}
                        className={`${field} ${fromSubtasks ? "bg-brand-bg text-brand-sub cursor-not-allowed" : ""}`}
                      />
                      {fromSubtasks && <div className="text-[10.5px] text-brand-sub mt-1">Set by its subtasks (latest due date).</div>}
                    </>
                  );
                })()}
              </div>
            </div>
            {!draft.isMilestone && (
              <div className="text-[10.5px] text-brand-sub -mt-2">
                Fill any two of Start / Duration / Due — the third is computed on save (skips weekends and holidays set in Work Calendar).
              </div>
            )}
            {(() => {
              // A subtask outside its main task's dates widens the main task on save.
              const parent = draft.parentId ? allTasks.find((t) => t.id === draft.parentId) : undefined;
              if (!parent) return null;
              if (parent.isMilestone) {
                // A milestone follows its latest subtask due date.
                if (!draft.dueDate || !parent.dueDate || draft.dueDate <= parent.dueDate) return null;
                return (
                  <div className="text-[11px] -mt-1 rounded-lg px-2.5 py-1.5" style={{ background: "#FDF3E6", color: "#8A5A1A" }}>
                    Milestone {parent.code ?? parent.title} will move to {formatDateDisplay(draft.dueDate)}.
                  </div>
                );
              }
              const start = draft.startDate && parent.startDate && draft.startDate < parent.startDate ? draft.startDate : parent.startDate;
              const due = draft.dueDate && parent.dueDate && draft.dueDate > parent.dueDate ? draft.dueDate : parent.dueDate;
              if (start === parent.startDate && due === parent.dueDate) return null;
              return (
                <div className="text-[11px] -mt-1 rounded-lg px-2.5 py-1.5" style={{ background: "#FDF3E6", color: "#8A5A1A" }}>
                  Main task {parent.code ?? parent.title} will extend to {formatDateDisplay(start)} – {formatDateDisplay(due)}.
                </div>
              );
            })()}
            {(() => {
              // Live dependency-conflict banner: reflects the draft, not the
              // saved task, so escalating a start date shows/hides the warning
              // immediately as you type. Only flags DIRECT conflicts here —
              // upstream cascades don't fit into the modal's frame of one task.
              // A milestone has no Start: its own date is what must not come first.
              const ownStart = draft.isMilestone ? draft.dueDate : draft.startDate;
              if (!ownStart || draft.dependsOn.length === 0) return null;
              const clashing = draft.dependsOn
                .map((id) => allTasks.find((t) => t.id === id))
                .filter((t): t is Task => !!t && t.status !== "DONE" && !!t.dueDate && t.dueDate > ownStart);
              if (clashing.length === 0) return null;
              const labels = clashing.map((c) => c.code || c.title).slice(0, 3).join(", ");
              const verb = clashing.length === 1 ? "finishes" : "finish";
              return (
                <div className="mt-1 rounded-md px-2 py-1.5 text-[11.5px]" style={{ background: "#FBEEDD", color: "#8A5A20" }}>
                  {draft.isMilestone
                    ? <>⚠️ Milestone on {formatDateDisplay(ownStart)} is before {labels} {verb} ({formatDateDisplay(clashing[0].dueDate)}). Move the milestone later or unset the predecessor.</>
                    : <>⚠️ Starts before {labels} {verb}. Either push Start back or unset the predecessor.</>}
                </div>
              );
            })()}

            {draft.id && draft.projectId && <TaskCustomFieldsPanel taskId={draft.id} />}

            {/* Less-used settings stay folded away until needed. */}
            <div className="border-t border-dashed border-brand-border pt-2.5 flex flex-wrap items-center gap-x-1">
              <button type="button" onClick={() => setMoreOpen(!moreOpen)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark">
                {moreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} More options
              </button>
              {!moreOpen && (
                <span className="text-[11px] text-brand-sub">
                  — {draft.id ? "code, " : ""}tags, milestone, repeat, depends on, parent task{draft.id ? ", duplicate" : ""}
                </span>
              )}
            </div>

            {moreOpen && (
              <div className="flex flex-col gap-3">
                {draft.id && codeField}

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

                <label className="flex items-center gap-2 text-xs font-semibold text-brand-sub">
                  <input
                    type="checkbox"
                    checked={draft.isMilestone}
                    // A milestone is a single date: drop Start and Duration when ticked.
                    onChange={(e) => setDraft({ ...draft, isMilestone: e.target.checked, ...(e.target.checked ? { startDate: "", durationDays: "" } : {}) })}
                  />
                  This is a milestone (single-date marker, no duration)
                </label>

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
                    className={field}
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

                {draft.id && onDuplicate && (
                  <div className="flex items-center gap-1.5">
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

                {savedTask && onAddSubtask && (
                  <button
                    onClick={() => onAddSubtask(savedTask)}
                    className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold border border-brand-border text-brand-text"
                  >
                    + Add subtask under this task
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!canFullyEdit && draft.id && onDuplicate && (
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
        {!canFullyEdit && draft.id && draft.projectId && <TaskCustomFieldsPanel taskId={draft.id} />}
        </div>

        {/* Panels stay mounted while hidden, so a half-typed comment survives switching tabs. */}
        {draft.id && <div className={tab === "checklist" ? panelWrap : "hidden"}><TaskChecklistPanel taskId={draft.id} /></div>}
        {draft.id && <div className={tab === "time" ? panelWrap : "hidden"}><TaskTimePanel taskId={draft.id} currentUserId={currentUserId} canManageOthers={canFullyEdit} team={team} /></div>}
        {draft.id && <div className={tab === "files" ? panelWrap : "hidden"}><TaskAttachmentsPanel taskId={draft.id} /></div>}
        {draft.id && <div className={tab === "comments" ? panelWrap : "hidden"}><TaskActivityPanel taskId={draft.id} currentUserId={currentUserId} isSuperAdmin={isSuperAdmin} /></div>}
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
