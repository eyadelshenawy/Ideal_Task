"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Search, LayoutGrid, List as ListIcon, CalendarDays, Users, Building2, Download, Upload, Loader2, Contact as ContactIcon, Trash2, ListChecks, BarChart3, FileDown, Bookmark, X, AlertTriangle } from "lucide-react";
import useSWR from "swr";
import type { Task, Project, TeamMember, Contact, Status, AssigneeDisplay } from "@/types/models";
import type { ImportPreview } from "@/types/import";
import { colorForIndex, STATUSES, PRIORITIES, todayStr, sortTasks, type SortBy } from "@/lib/taskHelpers";
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
import LogoutButton from "./LogoutButton";
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
  overdueOnly: boolean;
  milestonesOnly: boolean;
}

const defaultFilters: Filters = {
  search: "", assigneeId: "all", priority: "all", projectId: "all",
  overdueOnly: false, milestonesOnly: false,
};

export default function Dashboard({ userId, userName, isSuperAdmin, administeredProjectIds }: DashboardProps) {
  const { data: tasks, mutate: mutateTasks } = useSWR<Task[]>("/api/tasks", fetcher);
  const { data: team, mutate: mutateTeam } = useSWR<TeamMember[]>("/api/team", fetcher);
  const { data: projects, mutate: mutateProjects } = useSWR<Project[]>("/api/projects", fetcher);
  const { data: contacts, mutate: mutateContacts } = useSWR<Contact[]>("/api/contacts", fetcher);

  const [view, setView] = useState<"board" | "list" | "timeline" | "reports" | "attention">("board");
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
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    if (filters.overdueOnly && !(t.dueDate && t.dueDate < today && t.status !== "DONE")) return false;
    if (filters.milestonesOnly && !t.isMilestone) return false;
    if (filters.assigneeId !== "all" && !t.assigneeIds.includes(filters.assigneeId)) return false;
    if (filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.projectId !== "all" && t.projectId !== filters.projectId) return false;
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      const projectName = projectList.find((p) => p.id === t.projectId)?.name || "";
      if (!t.title.toLowerCase().includes(q) && !projectName.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [taskList, filters, today, projectList]);

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

  function openEdit(task: Task) {
    setDraft(draftFromTask(task));
    setEditingCanFullyEdit(canManage(task));
    setFormError("");
    setModalOpen(true);
  }

  async function saveDraft() {
    const fullEdit = draft.id ? editingCanFullyEdit : true;
    if (fullEdit && !draft.title.trim()) {
      setFormError("Title is required");
      return;
    }
    try {
      if (draft.id) {
        const payload = fullEdit
          ? {
              code: draft.code, title: draft.title, description: draft.description,
              projectId: draft.projectId || null, assignees: draft.assignees,
              priority: draft.priority, status: draft.status,
              startDate: draft.startDate || null, dueDate: draft.dueDate || null,
              progress: draft.progress, isMilestone: draft.isMilestone, dependsOn: draft.dependsOn,
              recurrenceFreq: draft.recurrenceFreq || null, recurrenceEndDate: draft.recurrenceEndDate || null,
            }
          : { status: draft.status, progress: draft.progress };
        await api.updateTask(draft.id, payload);
      } else {
        await api.createTask({
          code: draft.code, title: draft.title, description: draft.description,
          projectId: draft.projectId || null, assignees: draft.assignees,
          priority: draft.priority, status: draft.status,
          startDate: draft.startDate || null, dueDate: draft.dueDate || null,
          progress: draft.progress, isMilestone: draft.isMilestone, dependsOn: draft.dependsOn,
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
      { Code: "IDT-001", Title: "Kickoff meeting", Project: "Fayendra", Assignee: "Eyad Badran", Priority: "High", Status: "To Do", "Start Date": "2026-08-01", "Due Date": "2026-08-03", Progress: 0, Milestone: "No", "Depends On": "" },
      { Code: "IDT-002", Title: "Go-live", Project: "Fayendra", Assignee: "", Priority: "High", Status: "To Do", "Start Date": "", "Due Date": "2026-09-15", Progress: 0, Milestone: "Yes", "Depends On": "IDT-001" },
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

  const sortedBoard = (statusId: Status) => sortTasks(filteredTasks.filter((t) => t.status === statusId), sortBy, teamList);
  const sortedList = sortTasks(filteredTasks, sortBy, teamList);
  const sortedGantt = sortTasks(filteredTasks, sortBy, teamList);

  if (!tasks || !team || !projects || !contacts) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-dark" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-3">
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
            </div>
            <span className="text-white text-xs">{userName}</span>
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
          <ReportsView tasks={taskList} projects={projectList} />
        ) : view === "attention" ? (
          <NeedsAttentionView
            tasks={taskList}
            projectList={projectList}
            allTasks={taskList}
            canManage={canManage}
            getAssigneeDisplays={getAssigneeDisplays}
            onEdit={openEdit}
            onDelete={deleteTask}
          />
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-lg px-2 py-1.5 text-xs bg-white border border-brand-border"
          >
            <option value="dueDate">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="assignee">Sort: Assignee</option>
            <option value="created">Sort: Newest</option>
          </select>
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
                <button onClick={() => setFilters(sf.filters)} className="text-[11.5px] font-medium text-brand-text">
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
                      <TaskCard
                        key={task.id}
                        task={task}
                        assignees={getAssigneeDisplays(task)}
                        project={projectList.find((p) => p.id === task.projectId)}
                        allTasks={taskList}
                        canManage={canManage(task)}
                        onEdit={openEdit}
                        onDelete={deleteTask}
                        onMove={moveTask}
                        selectMode={selectMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={toggleSelect}
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
            {sortedList.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                assignees={getAssigneeDisplays(task)}
                project={projectList.find((p) => p.id === task.projectId)}
                allTasks={taskList}
                canManage={canManage(task)}
                onEdit={openEdit}
                onDelete={deleteTask}
                selectMode={selectMode}
                selected={selectedIds.has(task.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {view === "timeline" && <GanttView tasks={sortedGantt} onEditTask={openEdit} />}
        </>
        )}
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
          onCreateContact={createContact}
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
