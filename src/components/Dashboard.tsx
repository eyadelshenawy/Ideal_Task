"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Search, LayoutGrid, List as ListIcon, CalendarDays, Users, Building2, Download, Upload, Loader2, Contact as ContactIcon, Trash2, ListChecks, BarChart3, FileDown, Bookmark, X, AlertTriangle, ScrollText, BookOpen, ChevronDown, ChevronRight, Lock, ClipboardList } from "lucide-react";
import useSWR from "swr";
import type { Task, Project, TeamMember, Contact, Status, AssigneeDisplay } from "@/types/models";
import type { ImportPreview } from "@/types/import";
import {
  colorForIndex, STATUSES, PRIORITIES, todayStr, sortTasks, toTreeRows, splitModules, isDueThisWeek,
  groupTaskRows, countGroupUnits, GROUP_FIELD_LABELS, type SortBy, type GroupField, type GroupNode, type TaskTreeRow,
} from "@/lib/taskHelpers";
import { api } from "@/lib/apiClient";
import TaskCard from "./TaskCard";
import TaskListRow from "./TaskListRow";
import GanttView from "./GanttView";
import TaskModal, { blankDraft, draftFromTask, type TaskDraft } from "./TaskModal";
import TeamModal from "./TeamModal";
import ProjectsModal from "./ProjectsModal";
import ContactsModal from "./ContactsModal";
import TrashModal from "./TrashModal";
import ImportPreviewModal from "./ImportPreviewModal";
import BulkActionBar from "./BulkActionBar";
import ReportsView from "./ReportsView";
import NeedsAttentionView from "./NeedsAttentionView";
import PersonalTasksView from "./PersonalTasksView";
import NotificationBell from "./NotificationBell";
import AuditLogModal from "./AuditLogModal";
import ChecklistTemplatesModal from "./ChecklistTemplatesModal";
import LogoutButton from "./LogoutButton";
import GlobalSearchModal from "./GlobalSearchModal";
import PushToggle from "./PushToggle";
import StatCard from "./ui/StatCard";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load");
    return r.json();
  });

interface DashboardProps {
  userId: string;
  userName: string;
  isSuperAdmin: boolean;
  /** Project ids this user holds a per-project admin grant on. */
  administeredProjectIds: string[];
}

interface Filters {
  search: string;
  assigneeId: string;
  priority: string;
  projectId: string;
  /** Empty = all modules. A task matches if ANY of its own (comma-separated) modules is in this list. */
  moduleIds: string[];
  overdueOnly: boolean;
  milestonesOnly: boolean;
  dueThisWeek: boolean;
}

const defaultFilters: Filters = {
  search: "", assigneeId: "all", priority: "all", projectId: "all", moduleIds: [],
  overdueOnly: false, milestonesOnly: false, dueThisWeek: false,
};

const GROUP_PAGE_SIZE = 30;

export default function Dashboard({ userId, userName, isSuperAdmin, administeredProjectIds }: DashboardProps) {
  const { data: tasks, mutate: mutateTasks } = useSWR<Task[]>("/api/tasks", fetcher);
  const { data: team, mutate: mutateTeam } = useSWR<TeamMember[]>("/api/team", fetcher);
  const { data: projects, mutate: mutateProjects } = useSWR<Project[]>("/api/projects", fetcher);
  const { data: contacts, mutate: mutateContacts } = useSWR<Contact[]>("/api/contacts", fetcher);

  // List is the default landing view — it's the one with Group by, pagination,
  // and Compact view, so it scales to a large project better than Board,
  // which still renders every card in a column unbounded.
  const [view, setView] = useState<"board" | "list" | "timeline" | "reports" | "attention" | "personal">("list");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(blankDraft());
  const [editingCanFullyEdit, setEditingCanFullyEdit] = useState(true);
  const [formError, setFormError] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sortBy, setSortBy] = useState<SortBy>("dueDate");
  const savedFiltersKey = `idealtasks:savedFilters:${userId}`;
  const [savedFilters, setSavedFilters] = useState<{ id: string; name: string; filters: Filters }[]>([]);
  const [savingFilterName, setSavingFilterName] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [checklistTemplatesOpen, setChecklistTemplatesOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Which parent tasks have their subtasks collapsed in List view — purely
  // client-side display state, not persisted.
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(new Set());
  function toggleCollapse(taskId: string) {
    setCollapsedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }
  // Board is split into status columns, so a subtask can't literally nest
  // under its parent there the way it does in List — this just declutters
  // a project with a lot of subtasks by hiding them as separate cards
  // (their parent still shows its "N/M subtasks" progress either way).
  const [hideSubtasksInBoard, setHideSubtasksInBoard] = useState(false);
  const [moduleFilterOpen, setModuleFilterOpen] = useState(false);
  // Hides Done tasks everywhere (Board/List/Timeline) — separate from the
  // per-view "Hide subtasks" toggle above.
  const [hideDone, setHideDone] = useState(false);
  const [quickFiltersOpen, setQuickFiltersOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  // List-view only: which fields to nest tasks under, in order. Empty = the
  // existing flat behavior, unchanged.
  const [groupByLevels, setGroupByLevels] = useState<GroupField[]>([]);
  // Group keys the user has toggled away from their default open/closed
  // state (the very first top-level group defaults open, every other group
  // defaults closed) — same toggle-relative-to-default idea as elsewhere.
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(new Set());
  function toggleGroupCollapse(key: string) {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  // How many units (top-level tasks, each with its full subtree) are shown
  // per group before a "Show more" button is needed — keyed by group key.
  const [groupVisibleCounts, setGroupVisibleCounts] = useState<Record<string, number>>({});
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  // Board drag-and-drop: the id of the card currently being dragged, so a
  // column's onDrop knows which task to move without threading the native
  // DataTransfer payload through every handler.
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const taskList = tasks ?? [];
  const teamList = team ?? [];
  const projectList = projects ?? [];
  const contactList = contacts ?? [];

  const colorMap = Object.fromEntries(teamList.map((m, i) => [m.id, colorForIndex(i)]));

  function canManage(task: Task): boolean {
    return isSuperAdmin || (task.projectId !== null && administeredProjectIds.includes(task.projectId));
  }
  const canCreateAnywhere = isSuperAdmin || administeredProjectIds.length > 0;
  const modalProjects = isSuperAdmin ? projectList : projectList.filter((p) => administeredProjectIds.includes(p.id));

  function getAssigneeDisplays(task: Task): AssigneeDisplay[] {
    const users: AssigneeDisplay[] = task.assigneeIds
      .map((id) => teamList.find((m) => m.id === id))
      .filter((m): m is TeamMember => !!m)
      .map((m) => ({ name: m.name, color: colorMap[m.id], active: m.active, kind: "user" }));
    const contactDisplays: AssigneeDisplay[] = task.contactAssigneeIds
      .map((id) => contactList.find((c) => c.id === id))
      .filter((c): c is Contact => !!c)
      .map((c) => ({ name: c.name, kind: "contact" }));
    return [...users, ...contactDisplays];
  }

  const today = todayStr();
  const stats = useMemo(() => ({
    total: taskList.length,
    inProgress: taskList.filter((t) => t.status === "INPROGRESS").length,
    overdue: taskList.filter((t) => t.dueDate && t.dueDate < today && t.status !== "DONE").length,
    done: taskList.filter((t) => t.status === "DONE").length,
    milestones: taskList.filter((t) => t.isMilestone).length,
  }), [taskList, today]);

  const filteredTasks = useMemo(() => taskList.filter((t) => {
    if (hideDone && t.status === "DONE") return false;
    if (filters.overdueOnly && !(t.dueDate && t.dueDate < today && t.status !== "DONE")) return false;
    if (filters.milestonesOnly && !t.isMilestone) return false;
    if (filters.dueThisWeek && !isDueThisWeek(t)) return false;
    if (filters.assigneeId !== "all" && !t.assigneeIds.includes(filters.assigneeId)) return false;
    if (filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.projectId !== "all" && t.projectId !== filters.projectId) return false;
    if (filters.moduleIds.length > 0 && !splitModules(t.module).some((m) => filters.moduleIds.includes(m))) return false;
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      const projectName = projectList.find((p) => p.id === t.projectId)?.name || "";
      if (
        !t.title.toLowerCase().includes(q) &&
        !projectName.toLowerCase().includes(q) &&
        !(t.module || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [taskList, filters, today, projectList, hideDone]);

  const moduleList = useMemo(
    () => Array.from(new Set(taskList.flatMap((t) => splitModules(t.module)))).sort(),
    [taskList]
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(savedFiltersKey);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch {
      // ignore malformed/unavailable localStorage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistSavedFilters(next: { id: string; name: string; filters: Filters }[]) {
    setSavedFilters(next);
    try {
      window.localStorage.setItem(savedFiltersKey, JSON.stringify(next));
    } catch {
      // ignore — worst case the saved filter just doesn't persist
    }
  }

  function confirmSaveCurrentFilter() {
    if (!savingFilterName || !savingFilterName.trim()) return;
    persistSavedFilters([...savedFilters, { id: `${Date.now()}`, name: savingFilterName.trim(), filters }]);
    setSavingFilterName(null);
  }

  function deleteSavedFilter(id: string) {
    persistSavedFilters(savedFilters.filter((f) => f.id !== id));
  }

  function openNew() {
    const d = blankDraft();
    if (!isSuperAdmin && administeredProjectIds.length > 0) {
      d.projectId = administeredProjectIds[0];
    }
    setDraft(d);
    setEditingCanFullyEdit(true);
    setFormError("");
    setModalOpen(true);
  }

  function openTaskById(taskId: string) {
    const task = taskList.find((t) => t.id === taskId);
    if (task) openEdit(task);
  }

  function openEdit(task: Task) {
    setDraft(draftFromTask(task));
    setEditingCanFullyEdit(canManage(task));
    setFormError("");
    setModalOpen(true);
  }

  // Quick shortcut from inside a task's own modal: opens a blank draft
  // already scoped to that task's project and parented under it, with a
  // suggested hierarchical code — same "New Task" form, just pre-filled.
  function addSubtask(parent: Task) {
    const d = blankDraft();
    d.projectId = parent.projectId ?? "";
    d.parentId = parent.id;
    if (parent.code) {
      d.code = `${parent.code}-${String(parent.childCodeSeq + 1).padStart(2, "0")}`;
    }
    setDraft(d);
    setEditingCanFullyEdit(true);
    setFormError("");
    setModalOpen(true);
  }

  async function saveDraft() {
    const fullEdit = draft.id ? editingCanFullyEdit : true;
    if (fullEdit && !draft.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!draft.id) {
      if (!draft.code.trim()) return setFormError("Code is required");
      if (!draft.projectId) return setFormError("Project is required");
      if (draft.assignees.length === 0) return setFormError("At least one assignee is required");
      if (!draft.dueDate) return setFormError(draft.isMilestone ? "Date is required" : "Due date is required");
      if (!draft.isMilestone && !draft.startDate) return setFormError("Start date is required");
    }
    if (fullEdit && draft.projectId && draft.code.trim()) {
      const project = projectList.find((p) => p.id === draft.projectId);
      const prefix = `${project?.code ?? ""}-`;
      if (project?.code && !draft.code.trim().toUpperCase().startsWith(prefix.toUpperCase())) {
        setFormError(`Code must start with "${prefix}" for this project`);
        return;
      }
    }
    try {
      if (draft.id) {
        const payload = fullEdit
          ? {
              code: draft.code, title: draft.title, description: draft.description, module: draft.module,
              projectId: draft.projectId || null, assignees: draft.assignees,
              priority: draft.priority, status: draft.status,
              startDate: draft.startDate || null, dueDate: draft.dueDate || null,
              // Only sent when the task is actually Done and the field holds a
              // value — otherwise omitted so the server's own auto-set (on
              // completion) / auto-clear (on reopen) logic takes over.
              ...(draft.status === "DONE" && draft.completedAt ? { completedAt: draft.completedAt } : {}),
              progress: draft.progress, isMilestone: draft.isMilestone, dependsOn: draft.dependsOn,
              recurrenceFreq: draft.recurrenceFreq || null, recurrenceEndDate: draft.recurrenceEndDate || null,
              tags: draft.tags, parentId: draft.parentId || null,
            }
          : { status: draft.status, progress: draft.progress };
        await api.updateTask(draft.id, payload);
      } else {
        await api.createTask({
          code: draft.code, title: draft.title, description: draft.description, module: draft.module,
          projectId: draft.projectId || null, assignees: draft.assignees,
          priority: draft.priority, status: draft.status,
          startDate: draft.startDate || null, dueDate: draft.dueDate || null,
          ...(draft.status === "DONE" && draft.completedAt ? { completedAt: draft.completedAt } : {}),
          progress: draft.progress, isMilestone: draft.isMilestone, dependsOn: draft.dependsOn,
          recurrenceFreq: draft.recurrenceFreq || null, recurrenceEndDate: draft.recurrenceEndDate || null,
          tags: draft.tags, parentId: draft.parentId || null,
        });
      }
      await mutateTasks();
      setModalOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save task");
    }
  }

  async function deleteTask(id: string) {
    await api.deleteTask(id);
    await mutateTasks();
  }

  async function duplicateTask(id: string, projectId?: string) {
    await api.duplicateTask(id, projectId);
    await mutateTasks();
    setModalOpen(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkSetStatus(status: Status) {
    await api.bulkUpdateTasks({ taskIds: Array.from(selectedIds), status });
    await mutateTasks();
  }

  async function bulkSetAssignee(userId: string) {
    await api.bulkUpdateTasks({ taskIds: Array.from(selectedIds), assignees: [{ type: "user", id: userId }] });
    await mutateTasks();
  }

  async function bulkSetProject(projectId: string | null) {
    await api.bulkUpdateTasks({ taskIds: Array.from(selectedIds), projectId });
    await mutateTasks();
  }

  async function bulkDelete() {
    await api.bulkDeleteTasks(Array.from(selectedIds));
    await mutateTasks();
    exitSelectMode();
  }

  async function moveTask(task: Task, dir: 1 | -1) {
    const order: Status[] = STATUSES.map((s) => s.id);
    const idx = order.indexOf(task.status);
    const next = order[idx + dir];
    if (!next) return;
    await api.updateTask(task.id, { status: next, progress: next === "DONE" ? 100 : task.progress });
    await mutateTasks();
  }

  async function moveTaskToStatus(taskId: string, statusId: Status) {
    const task = taskList.find((t) => t.id === taskId);
    if (!task || task.status === statusId) return;
    await api.updateTask(task.id, { status: statusId, progress: statusId === "DONE" ? 100 : task.progress });
    await mutateTasks();
  }

  async function createContact(name: string): Promise<Contact | null> {
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const contact: Contact = await res.json();
      await mutateContacts();
      return contact;
    } catch {
      return null;
    }
  }

  function downloadTemplate() {
    const sampleRows = [
      { Code: "IDT-001", Title: "Kickoff meeting", Description: "Align on scope and timeline", Module: "", Tags: "onboarding", Comment: "", Project: "Fayendra", Assignee: "Eyad Badran", Priority: "High", Status: "To Do", "Start Date": "2026-08-01", "Due Date": "2026-08-03", Progress: 0, Milestone: "No", "Depends On": "", "Parent Code": "" },
      { Code: "IDT-002", Title: "Go-live", Description: "", Module: "Billing", Tags: "", Comment: "", Project: "Fayendra", Assignee: "", Priority: "High", Status: "To Do", "Start Date": "", "Due Date": "2026-09-15", Progress: 0, Milestone: "Yes", "Depends On": "IDT-001", "Parent Code": "" },
      { Code: "", Title: "Draft launch announcement", Description: "", Module: "", Tags: "", Comment: "", Project: "Fayendra", Assignee: "", Priority: "Medium", Status: "To Do", "Start Date": "", "Due Date": "2026-09-10", Progress: 0, Milestone: "No", "Depends On": "", "Parent Code": "IDT-002" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, "Tasks");
    const wbout = XLSX.write(wbOut, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "IDEAL-Tasks-Template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportToExcel() {
    const rows = filteredTasks.map((t) => ({
      Code: t.code ?? "",
      Title: t.title,
      Description: t.description ?? "",
      Module: t.module ?? "",
      Tags: t.tags.join(", "),
      Project: projectList.find((p) => p.id === t.projectId)?.name ?? "",
      Assignees: getAssigneeDisplays(t).map((a) => a.name).join(", "),
      Priority: PRIORITIES.find((p) => p.id === t.priority)?.label ?? t.priority,
      Status: STATUSES.find((s) => s.id === t.status)?.label ?? t.status,
      "Start Date": t.startDate ?? "",
      "Due Date": t.dueDate ?? "",
      Progress: t.progress,
      Milestone: t.isMilestone ? "Yes" : "No",
      "Depends On": t.dependsOn
        .map((id) => taskList.find((dt) => dt.id === id))
        .filter((dt): dt is Task => !!dt)
        .map((dt) => dt.code || dt.title)
        .join(", "),
      "Parent Code": (t.parentId && taskList.find((pt) => pt.id === t.parentId)?.code) || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, ws, "Tasks");
    const wbout = XLSX.write(wbOut, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IDEAL-Tasks-Export-${todayStr()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error("bad response");
      const preview: ImportPreview = await res.json();
      setImportPreview(preview);
    } catch {
      setImportError("Couldn't read this file — please use the downloaded template format.");
    }
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImportSubmitting(true);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasksToAdd: importPreview.tasksToAdd, newProjectNames: importPreview.newProjectNames }),
      });
      if (!res.ok) throw new Error("Import failed");
      await Promise.all([mutateTasks(), mutateProjects()]);
      setImportPreview(null);
    } catch {
      setImportError("Import failed — please try again.");
    } finally {
      setImportSubmitting(false);
    }
  }

  const sortedBoard = (statusId: Status) => sortTasks(
    filteredTasks.filter((t) => t.status === statusId && !(hideSubtasksInBoard && t.parentId)),
    sortBy, teamList
  );
  const sortedList = sortTasks(filteredTasks, sortBy, teamList);
  const sortedGantt = sortTasks(filteredTasks, sortBy, teamList);

  function renderTaskListRow({ task, depth, hasChildren, doneChildCount, totalChildCount }: TaskTreeRow) {
    return (
      <TaskListRow
        key={task.id}
        task={task}
        assignees={getAssigneeDisplays(task)}
        project={projectList.find((p) => p.id === task.projectId)}
        allTasks={taskList}
        canManage={canManage(task)}
        onEdit={openEdit}
        onDelete={deleteTask}
        onDuplicate={duplicateTask}
        onChangeStatus={(t, status) => moveTaskToStatus(t.id, status)}
        selectMode={selectMode}
        selected={selectedIds.has(task.id)}
        onToggleSelect={toggleSelect}
        depth={depth}
        hasChildren={hasChildren}
        collapsed={collapsedParentIds.has(task.id)}
        onToggleCollapse={toggleCollapse}
        doneChildCount={doneChildCount}
        totalChildCount={totalChildCount}
        density={density}
      />
    );
  }

  // "Show N more" pagination is per group, counted in units (a root task +
  // its whole subtree) rather than rows, so a page break never splits a
  // parent from its own subtasks.
  function renderGroupUnits(units: TaskTreeRow[][], groupKey: string) {
    const visible = groupVisibleCounts[groupKey] ?? GROUP_PAGE_SIZE;
    const shown = units.slice(0, visible);
    const remaining = units.length - shown.length;
    return (
      <>
        {shown.flat().map((row) => renderTaskListRow(row))}
        {remaining > 0 && (
          <button
            onClick={() => setGroupVisibleCounts((prev) => ({ ...prev, [groupKey]: visible + GROUP_PAGE_SIZE }))}
            className="w-full text-center text-[11.5px] text-brand-dark py-1.5 border border-dashed border-brand-border rounded-lg mt-1 mb-2"
          >
            Show {Math.min(GROUP_PAGE_SIZE, remaining)} more
          </button>
        )}
      </>
    );
  }

  // The very first top-level group defaults open; every other group
  // defaults closed. `collapsedGroupKeys` only tracks deviations from that
  // per-group default.
  function renderGroupNode(node: GroupNode, groupDepth: number, indexInSiblings: number) {
    const isFlat = node.key === "__flat__";
    const defaultCollapsed = !(groupDepth === 0 && indexInSiblings === 0);
    const collapsed = !isFlat && (collapsedGroupKeys.has(node.key) ? !defaultCollapsed : defaultCollapsed);
    return (
      <div key={node.key} style={{ marginLeft: groupDepth * 16 }}>
        {!isFlat && (
          <div
            onClick={() => toggleGroupCollapse(node.key)}
            className="flex items-center gap-1.5 py-1.5 px-1 cursor-pointer font-semibold text-[12.5px] text-brand-text border-b border-brand-border"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{node.label}</span>
            <span className="text-brand-sub text-[11px] font-normal">{countGroupUnits(node)}</span>
          </div>
        )}
        {!collapsed && (
          node.children
            ? node.children.map((child, i) => renderGroupNode(child, groupDepth + 1, i))
            : renderGroupUnits(node.units, node.key)
        )}
      </div>
    );
  }

  if (!tasks || !team || !projects || !contacts) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-dark" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative w-[30px] h-[30px]">
              <div className="absolute top-0 left-0 w-5 h-5 rounded-md bg-white" />
              <div className="absolute bottom-0 right-0 w-5 h-5 rounded-md bg-brand-light" />
            </div>
            <div>
              <div className="text-white font-bold text-[15px] leading-tight">IDEAL Tasks</div>
              <div className="text-[#CFE3D8] text-[11px]">Team Task Manager</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.12)" }}>
              <button
                onClick={() => setView("board")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "board" ? "#fff" : "transparent", color: view === "board" ? "#0A5A46" : "#fff" }}
              >
                <LayoutGrid size={13} /> Board
              </button>
              <button
                onClick={() => setView("list")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "list" ? "#fff" : "transparent", color: view === "list" ? "#0A5A46" : "#fff" }}
              >
                <ListIcon size={13} /> List
              </button>
              <button
                onClick={() => setView("timeline")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "timeline" ? "#fff" : "transparent", color: view === "timeline" ? "#0A5A46" : "#fff" }}
              >
                <CalendarDays size={13} /> Timeline
              </button>
              <button
                onClick={() => setView("reports")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "reports" ? "#fff" : "transparent", color: view === "reports" ? "#0A5A46" : "#fff" }}
              >
                <BarChart3 size={13} /> Reports
              </button>
              <button
                onClick={() => setView("attention")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "attention" ? "#fff" : "transparent", color: view === "attention" ? "#0A5A46" : "#fff" }}
              >
                <AlertTriangle size={13} /> Attention
              </button>
              <button
                onClick={() => setView("personal")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold"
                style={{ background: view === "personal" ? "#fff" : "transparent", color: view === "personal" ? "#0A5A46" : "#fff" }}
              >
                <Lock size={13} /> My Tasks
              </button>
            </div>
            <span className="text-white text-xs">{userName}</span>
            <button
              onClick={() => setGlobalSearchOpen(true)}
              title="Search (Ctrl+K)"
              className="p-2 rounded-lg text-white"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Search size={15} />
            </button>
            <PushToggle />
            <NotificationBell onOpenTask={openTaskById} />
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener noreferrer"
              title="User Guide"
              className="p-2 rounded-lg text-white"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <BookOpen size={15} />
            </a>
            {isSuperAdmin && (
              <button
                onClick={() => setTeamModalOpen(true)}
                title="Manage Team"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <Users size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => setProjectsModalOpen(true)}
                title="Manage Projects"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <Building2 size={15} />
              </button>
            )}
            {canCreateAnywhere && (
              <button
                onClick={() => setContactsModalOpen(true)}
                title="Manage Contacts"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <ContactIcon size={15} />
              </button>
            )}
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              title={selectMode ? "Exit select mode" : "Select multiple tasks"}
              className="p-2 rounded-lg text-white"
              style={{ background: selectMode ? "#fff" : "rgba(255,255,255,0.12)", color: selectMode ? "#0A5A46" : "#fff" }}
            >
              <ListChecks size={15} />
            </button>
            {canCreateAnywhere && (
              <button
                onClick={() => setTrashModalOpen(true)}
                title="Trash"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <Trash2 size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => setAuditLogOpen(true)}
                title="Audit Log"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <ScrollText size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => setChecklistTemplatesOpen(true)}
                title="Checklist Templates"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <ClipboardList size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={exportToExcel}
                title="Export tasks to Excel"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <FileDown size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={downloadTemplate}
                title="Download Excel template"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <Download size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Import from Excel"
                className="p-2 rounded-lg text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <Upload size={15} />
              </button>
            )}
            {isSuperAdmin && (
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            )}
            {canCreateAnywhere && (
              <button
                onClick={openNew}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-light text-brand-dark"
              >
                <Plus size={14} /> New Task
              </button>
            )}
            <LogoutButton />
          </div>
        </div>
      </div>

      {importError && (
        <div className="px-4 py-1.5 text-xs text-center" style={{ background: "#FBE7E5", color: "#9A3530" }}>
          {importError}
        </div>
      )}

      <div className="px-4 py-3">
        {view === "reports" ? (
          <ReportsView tasks={taskList} projects={projectList} team={teamList} isSuperAdmin={isSuperAdmin} />
        ) : view === "attention" ? (
          <NeedsAttentionView
            tasks={taskList}
            projectList={projectList}
            allTasks={taskList}
            canManage={canManage}
            getAssigneeDisplays={getAssigneeDisplays}
            onEdit={openEdit}
            onDelete={deleteTask}
            onDuplicate={duplicateTask}
            onChangeStatus={(t, status) => moveTaskToStatus(t.id, status)}
          />
        ) : view === "personal" ? (
          <PersonalTasksView currentUserId={userId} />
        ) : (
        <>
        <div className="flex gap-2 mb-3 flex-wrap">
          <StatCard label="Total" value={stats.total} color="#0A5A46" />
          <StatCard label="In Progress" value={stats.inProgress} color="#82B478" />
          <StatCard
            label="Overdue" value={stats.overdue} color="#C4443D"
            active={filters.overdueOnly}
            onClick={() => setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))}
          />
          <StatCard label="Done" value={stats.done} color="#0A5A46" />
          <StatCard
            label="Milestones" value={stats.milestones} color="#7A5C9E"
            active={filters.milestonesOnly}
            onClick={() => setFilters((f) => ({ ...f, milestonesOnly: !f.milestonesOnly }))}
          />
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-white border border-brand-border">
            <Search size={14} className="text-brand-sub" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search..."
              className="outline-none text-[12.5px] w-[110px]"
            />
          </div>
          <select
            value={filters.assigneeId}
            onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
            className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border"
          >
            <option value="all">All Assignees</option>
            {teamList.map((m) => <option key={m.id} value={m.id}>{m.name}{!m.active ? " (Inactive)" : ""}</option>)}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border"
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select
            value={filters.projectId}
            onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
            className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border"
          >
            <option value="all">All Projects</option>
            {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative">
            <button
              onClick={() => setModuleFilterOpen((v) => !v)}
              className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border text-brand-text"
            >
              {filters.moduleIds.length === 0 ? "All Modules" : `${filters.moduleIds.length} module${filters.moduleIds.length === 1 ? "" : "s"}`}
            </button>
            {moduleFilterOpen && (
              <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-[180px] max-h-[220px] overflow-y-auto rounded-lg bg-white border border-brand-border shadow-lg p-2">
                {moduleList.length === 0 && <div className="text-[11px] text-brand-sub px-1 py-1">No modules yet</div>}
                {moduleList.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-xs py-0.5 text-brand-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.moduleIds.includes(m)}
                      onChange={() => setFilters((f) => ({
                        ...f,
                        moduleIds: f.moduleIds.includes(m) ? f.moduleIds.filter((x) => x !== m) : [...f.moduleIds, m],
                      }))}
                    />
                    {m}
                  </label>
                ))}
                {filters.moduleIds.length > 0 && (
                  <button
                    onClick={() => setFilters((f) => ({ ...f, moduleIds: [] }))}
                    className="text-[11px] text-brand-dark underline mt-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border"
          >
            <option value="dueDate">Sort: Due Date</option>
            <option value="code">Sort: Code</option>
            <option value="priority">Sort: Priority</option>
            <option value="assignee">Sort: Assignee</option>
            <option value="created">Sort: Newest</option>
          </select>
          <button
            onClick={() => setHideDone((v) => !v)}
            title="Hide Done tasks everywhere"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs border"
            style={{
              background: hideDone ? "#0A5A46" : "#fff",
              color: hideDone ? "#fff" : "#5B6B64",
              borderColor: hideDone ? "#0A5A46" : "#E1E7E4",
            }}
          >
            Hide Done
          </button>
          <div className="relative">
            <button
              onClick={() => setQuickFiltersOpen((v) => !v)}
              className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border text-brand-text"
            >
              Quick filters
            </button>
            {quickFiltersOpen && (
              <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-[170px] rounded-lg bg-white border border-brand-border shadow-lg p-2">
                <label className="flex items-center gap-2 text-xs py-1 text-brand-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.assigneeId === userId}
                    onChange={() => setFilters((f) => ({ ...f, assigneeId: f.assigneeId === userId ? "all" : userId }))}
                  />
                  My tasks
                </label>
                <label className="flex items-center gap-2 text-xs py-1 text-brand-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.overdueOnly}
                    onChange={() => setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))}
                  />
                  Overdue
                </label>
                <label className="flex items-center gap-2 text-xs py-1 text-brand-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.priority === "HIGH"}
                    onChange={() => setFilters((f) => ({ ...f, priority: f.priority === "HIGH" ? "all" : "HIGH" }))}
                  />
                  High priority
                </label>
                <label className="flex items-center gap-2 text-xs py-1 text-brand-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.dueThisWeek}
                    onChange={() => setFilters((f) => ({ ...f, dueThisWeek: !f.dueThisWeek }))}
                  />
                  Due this week
                </label>
              </div>
            )}
          </div>
          {view === "list" && (
            <div className="relative">
              <button
                onClick={() => setGroupByOpen((v) => !v)}
                className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border text-brand-text"
              >
                {groupByLevels.length === 0 ? "Group by" : `Group: ${groupByLevels.map((f) => GROUP_FIELD_LABELS[f]).join(" › ")}`}
              </button>
              {groupByOpen && (
                <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-[220px] rounded-lg bg-white border border-brand-border shadow-lg p-2">
                  <div className="flex flex-col gap-1.5">
                    {groupByLevels.map((lv, i) => {
                      const available = (Object.keys(GROUP_FIELD_LABELS) as GroupField[]).filter((f) => f === lv || !groupByLevels.includes(f));
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-brand-sub w-3">{i + 1}</span>
                          <select
                            value={lv}
                            onChange={(e) => {
                              const next = [...groupByLevels];
                              next[i] = e.target.value as GroupField;
                              setGroupByLevels(next);
                            }}
                            className="flex-1 rounded-lg border border-brand-border px-1.5 py-1 text-xs outline-none"
                          >
                            {available.map((f) => <option key={f} value={f}>{GROUP_FIELD_LABELS[f]}</option>)}
                          </select>
                          <button
                            onClick={() => setGroupByLevels(groupByLevels.filter((_, idx) => idx !== i))}
                            className="p-0.5 text-brand-sub hover:text-brand-text"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {groupByLevels.length < 4 && (
                    <button
                      onClick={() => {
                        const remaining = (Object.keys(GROUP_FIELD_LABELS) as GroupField[]).filter((f) => !groupByLevels.includes(f));
                        if (remaining.length > 0) setGroupByLevels([...groupByLevels, remaining[0]]);
                      }}
                      className="text-[11px] text-brand-dark underline mt-1.5"
                    >
                      + Add level
                    </button>
                  )}
                  {groupByLevels.length > 0 && (
                    <button
                      onClick={() => setGroupByLevels([])}
                      className="text-[11px] text-brand-sub underline mt-1.5 ml-3"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {view === "list" && (
            <button
              onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
              title="Toggle row density"
              className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border text-brand-sub"
            >
              {density === "comfortable" ? "Compact view" : "Comfortable view"}
            </button>
          )}
          {view === "board" && (
            <button
              onClick={() => setHideSubtasksInBoard((v) => !v)}
              title="Subtasks still count toward their parent's progress — this just hides their own cards"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs border"
              style={{
                background: hideSubtasksInBoard ? "#0A5A46" : "#fff",
                color: hideSubtasksInBoard ? "#fff" : "#5B6B64",
                borderColor: hideSubtasksInBoard ? "#0A5A46" : "#E1E7E4",
              }}
            >
              Hide subtasks
            </button>
          )}
          <button
            onClick={() => setSavingFilterName("")}
            title="Save current filter combination"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border text-brand-sub"
          >
            <Bookmark size={13} /> Save filter
          </button>
        </div>

        {savingFilterName !== null && (
          <div className="flex items-center gap-1.5 mb-3">
            <input
              autoFocus
              value={savingFilterName}
              onChange={(e) => setSavingFilterName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmSaveCurrentFilter(); if (e.key === "Escape") setSavingFilterName(null); }}
              placeholder="Name this filter…"
              className="rounded-lg px-2.5 py-1.5 text-xs bg-white border border-brand-border w-[160px]"
            />
            <button onClick={confirmSaveCurrentFilter} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-brand-dark text-white">
              Save
            </button>
            <button onClick={() => setSavingFilterName(null)} className="text-xs text-brand-sub px-1">
              Cancel
            </button>
          </div>
        )}

        {savedFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {savedFilters.map((sf) => (
              <div key={sf.id} className="flex items-center gap-1 rounded-full pl-2.5 pr-1 py-1 bg-white border border-brand-border">
                <button onClick={() => setFilters({ ...defaultFilters, ...sf.filters })} className="text-[11.5px] font-medium text-brand-text">
                  {sf.name}
                </button>
                <button onClick={() => deleteSavedFilter(sf.id)} className="p-0.5 rounded-full hover:bg-gray-100 text-brand-sub">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {selectMode && selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            team={teamList}
            projects={modalProjects}
            onClear={() => setSelectedIds(new Set())}
            onSetStatus={bulkSetStatus}
            onSetAssignee={bulkSetAssignee}
            onSetProject={bulkSetProject}
            onDelete={bulkDelete}
          />
        )}

        {view === "board" && (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {STATUSES.map((status) => {
              const colTasks = sortedBoard(status.id);
              return (
                <div
                  key={status.id}
                  style={{ minWidth: 250, width: 250, flexShrink: 0 }}
                  onDragOver={(e) => { if (draggedTaskId) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedTaskId) moveTaskToStatus(draggedTaskId, status.id);
                    setDraggedTaskId(null);
                  }}
                >
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
                      <TaskCard
                        key={task.id}
                        task={task}
                        assignees={getAssigneeDisplays(task)}
                        project={projectList.find((p) => p.id === task.projectId)}
                        allTasks={taskList}
                        canManage={canManage(task)}
                        onEdit={openEdit}
                        onDelete={deleteTask}
                        onDuplicate={duplicateTask}
                        onMove={moveTask}
                        selectMode={selectMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={toggleSelect}
                        draggable={!selectMode}
                        onDragStart={setDraggedTaskId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "list" && (
          <div>
            {sortedList.length === 0 && (
              <div className="text-center text-brand-sub text-sm py-10">No tasks match your filters</div>
            )}
            {groupTaskRows(toTreeRows(sortedList, collapsedParentIds), groupByLevels, { projectList, teamList })
              .map((node, i) => renderGroupNode(node, 0, i))}
          </div>
        )}

        {view === "timeline" && <GanttView tasks={sortedGantt} onEditTask={openEdit} />}
        </>
        )}
      </div>

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي). All rights reserved.
      </div>

      {modalOpen && (
        <TaskModal
          draft={draft}
          setDraft={setDraft}
          onClose={() => setModalOpen(false)}
          onSave={saveDraft}
          error={formError}
          team={teamList}
          projects={modalProjects}
          contacts={contactList}
          allTasks={taskList}
          canFullyEdit={editingCanFullyEdit}
          isSuperAdmin={isSuperAdmin}
          currentUserId={userId}
          onCreateContact={createContact}
          onDuplicate={editingCanFullyEdit ? duplicateTask : undefined}
          onAddSubtask={addSubtask}
        />
      )}

      {teamModalOpen && (
        <TeamModal
          team={teamList}
          projects={projectList}
          currentUserId={userId}
          onClose={() => setTeamModalOpen(false)}
          onChanged={() => mutateTeam()}
        />
      )}

      {projectsModalOpen && (
        <ProjectsModal
          projects={projectList}
          onClose={() => setProjectsModalOpen(false)}
          onChanged={() => mutateProjects()}
        />
      )}

      {contactsModalOpen && (
        <ContactsModal
          contacts={contactList}
          onClose={() => setContactsModalOpen(false)}
          onChanged={() => mutateContacts()}
        />
      )}

      {auditLogOpen && <AuditLogModal onClose={() => setAuditLogOpen(false)} />}

      {checklistTemplatesOpen && <ChecklistTemplatesModal onClose={() => setChecklistTemplatesOpen(false)} />}

      {globalSearchOpen && (
        <GlobalSearchModal onClose={() => setGlobalSearchOpen(false)} onOpenTask={openTaskById} />
      )}

      {trashModalOpen && (
        <TrashModal
          isSuperAdmin={isSuperAdmin}
          onClose={() => setTrashModalOpen(false)}
          onChanged={() => { mutateTasks(); mutateProjects(); }}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onConfirm={confirmImport}
          onCancel={() => setImportPreview(null)}
          submitting={importSubmitting}
        />
      )}
    </div>
  );
}
