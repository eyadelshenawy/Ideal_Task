import type { CSSProperties } from "react";
import type { Priority, Status, Task, TeamMember } from "@/types/models";

// Ported from ideal-tasks.jsx, with enum ids uppercased to match the Prisma schema.

export const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: "HIGH", label: "High", color: "#C4443D" },
  { id: "MEDIUM", label: "Medium", color: "#D98B3A" },
  { id: "LOW", label: "Low", color: "#6B8F80" },
];

export const STATUSES: { id: Status; label: string; color: string }[] = [
  { id: "TODO", label: "New", color: "#8A8F8C" },
  { id: "READY", label: "Ready", color: "#6B8FB5" },
  { id: "INPROGRESS", label: "In Progress", color: "#82B478" },
  { id: "INTERNAL_TEST", label: "Internal Test", color: "#D98B3A" },
  { id: "CUSTOMER_TEST", label: "Customer Test", color: "#4A7FB5" },
  { id: "DONE", label: "Done", color: "#0A5A46" },
];

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const PALETTE = [
  "#0A5A46", "#4E8C6E", "#3E7C7C", "#A66A3D", "#7A5C9E",
  "#C4443D", "#3D6EA6", "#B08D3E", "#707A75", "#8A5A9E",
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86400000);
}

export function formatDateDisplay(s?: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export type DueTone = "done" | "overdue" | "soon" | "normal";

/** Due within the next 7 days (inclusive of today), and not already Done. */
export function isDueThisWeek(task: Pick<Task, "dueDate" | "status">): boolean {
  if (!task.dueDate || task.status === "DONE") return false;
  const diff = diffDays(todayStr(), task.dueDate);
  return diff >= 0 && diff <= 7;
}

export function dueBadge(task: Pick<Task, "dueDate" | "status">): { label: string; tone: DueTone } | null {
  if (!task.dueDate) return null;
  const diff = diffDays(todayStr(), task.dueDate);
  if (task.status === "DONE") return { label: formatDateDisplay(task.dueDate), tone: "done" };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff <= 2) return { label: `Due in ${diff}d`, tone: "soon" };
  return { label: formatDateDisplay(task.dueDate), tone: "normal" };
}

export function toneStyle(tone: DueTone): CSSProperties {
  switch (tone) {
    case "overdue": return { background: "#FBE7E5", color: "#9A3530" };
    case "soon": return { background: "#FBEEDD", color: "#8A5A20" };
    case "done": return { background: "#E4EFE8", color: "#0A5A46" };
    default: return { background: "#EEF2F0", color: "#5B6B64" };
  }
}

export function initials(name: string): string {
  return name.trim().split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function priorityWeight(p: Priority): number {
  return p === "HIGH" ? 0 : p === "MEDIUM" ? 1 : 2;
}

/** Direct + transitive descendant ids of `taskId` within `tasks`, not including itself. */
export function descendantIds(taskId: string, tasks: Task[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
    childrenOf.get(t.parentId)!.push(t.id);
  }
  const result = new Set<string>();
  let frontier = [taskId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of childrenOf.get(id) ?? []) {
        if (!result.has(childId)) { result.add(childId); next.push(childId); }
      }
    }
    frontier = next;
  }
  return result;
}

export interface TaskTreeRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
  doneChildCount: number;
  totalChildCount: number;
}

/**
 * Re-orders `tasks` (already sorted however the caller likes) into
 * depth-first tree order — each task immediately followed by its children,
 * recursively — skipping the subtree of any id in `collapsed`. A task whose
 * parent isn't present in `tasks` (e.g. filtered out) is treated as a root,
 * so it's never silently dropped.
 */
export function toTreeRows(tasks: Task[], collapsed: Set<string>): TaskTreeRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenMap = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, []);
      childrenMap.get(t.parentId)!.push(t);
    } else {
      roots.push(t);
    }
  }
  const result: TaskTreeRow[] = [];
  function walk(list: Task[], depth: number) {
    for (const t of list) {
      const kids = childrenMap.get(t.id) ?? [];
      result.push({
        task: t,
        depth,
        hasChildren: kids.length > 0,
        doneChildCount: kids.filter((k) => k.status === "DONE").length,
        totalChildCount: kids.length,
      });
      if (kids.length > 0 && !collapsed.has(t.id)) walk(kids, depth + 1);
    }
  }
  walk(roots, 0);
  return result;
}

/** A task's `module` field holds a comma-separated list (e.g. "FICO, MM") — split it into its parts for display/filtering. */
export function splitModules(module: string | null | undefined): string[] {
  return (module ?? "").split(",").map((m) => m.trim()).filter(Boolean);
}

export type GroupField = "project" | "module" | "assignee" | "priority";

export const GROUP_FIELD_LABELS: Record<GroupField, string> = {
  project: "Project", module: "Module", assignee: "Assignee", priority: "Priority",
};

export interface GroupNode {
  key: string;
  label: string;
  /** Each unit is one root task plus its full (already tree-ordered) subtree — never split across groups. */
  units: TaskTreeRow[][];
  /** Present when there are more grouping levels below this one; absent at the leaf level. */
  children?: GroupNode[];
}

interface GroupLookups {
  projectList: { id: string; name: string }[];
  teamList: { id: string; name: string }[];
}

function groupFieldValue(root: Task, field: GroupField, lookups: GroupLookups): { key: string; label: string } {
  if (field === "project") {
    const p = lookups.projectList.find((x) => x.id === root.projectId);
    return { key: root.projectId ?? "__none__", label: p?.name ?? "No project" };
  }
  if (field === "module") {
    const m = splitModules(root.module)[0];
    return { key: m || "__none__", label: m || "No module" };
  }
  if (field === "assignee") {
    const id = root.assigneeIds[0];
    const m = lookups.teamList.find((x) => x.id === id);
    return { key: id ?? "__none__", label: m?.name ?? "Unassigned" };
  }
  const p = PRIORITIES.find((x) => x.id === root.priority);
  return { key: root.priority, label: p?.label ?? root.priority };
}

/** Splits tree-ordered rows back into units of [root, ...its full subtree]. */
function unitsFromTreeRows(rows: TaskTreeRow[]): TaskTreeRow[][] {
  const units: TaskTreeRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const unit: TaskTreeRow[] = [rows[i]];
    let j = i + 1;
    while (j < rows.length && rows[j].depth > 0) { unit.push(rows[j]); j++; }
    units.push(unit);
    i = j;
  }
  return units;
}

function groupUnits(units: TaskTreeRow[][], levels: GroupField[], levelIdx: number, lookups: GroupLookups): GroupNode[] {
  const buckets = new Map<string, { label: string; units: TaskTreeRow[][] }>();
  const order: string[] = [];
  for (const unit of units) {
    const { key, label } = groupFieldValue(unit[0].task, levels[levelIdx], lookups);
    if (!buckets.has(key)) { buckets.set(key, { label, units: [] }); order.push(key); }
    buckets.get(key)!.units.push(unit);
  }
  return order.map((key) => {
    const b = buckets.get(key)!;
    const node: GroupNode = { key, label: b.label, units: b.units };
    if (levelIdx + 1 < levels.length) node.children = groupUnits(b.units, levels, levelIdx + 1, lookups);
    return node;
  });
}

/**
 * Buckets already tree-ordered `rows` by one or more fields, root task only —
 * a parent and its whole subtree always land in the same group as the
 * parent, even if a subtask's own field value would differ. Empty `levels`
 * yields a single unlabeled group (the existing flat behavior, unchanged).
 */
export function groupTaskRows(rows: TaskTreeRow[], levels: GroupField[], lookups: GroupLookups): GroupNode[] {
  const units = unitsFromTreeRows(rows);
  if (levels.length === 0) return [{ key: "__flat__", label: "", units }];
  return groupUnits(units, levels, 0, lookups);
}

/** Total unit (top-level task) count under a group node, including nested subgroups. */
export function countGroupUnits(node: GroupNode): number {
  return node.children ? node.children.reduce((sum, c) => sum + countGroupUnits(c), 0) : node.units.length;
}

export function isBlocked(task: Pick<Task, "dependsOn">, allTasks: Task[]): boolean {
  return (task.dependsOn || []).some((id) => {
    const dep = allTasks.find((t) => t.id === id);
    return dep && dep.status !== "DONE";
  });
}

export function blockedByNames(task: Pick<Task, "dependsOn">, allTasks: Task[]): string[] {
  return (task.dependsOn || [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((d): d is Task => !!d && d.status !== "DONE")
    .map((d) => d.title);
}

export type SortBy = "dueDate" | "priority" | "assignee" | "created" | "code";

export function sortTasks(list: Task[], sortBy: SortBy, team: TeamMember[]): Task[] {
  const arr = [...list];
  if (sortBy === "dueDate") {
    arr.sort((a, b) => ((a.dueDate || "9999-99-99") < (b.dueDate || "9999-99-99") ? -1 : 1));
  } else if (sortBy === "code") {
    // Natural sort (ABC-2 before ABC-10) rather than plain string order.
    arr.sort((a, b) => (a.code || "").localeCompare(b.code || "", undefined, { numeric: true, sensitivity: "base" }));
  } else if (sortBy === "priority") {
    arr.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
  } else if (sortBy === "assignee") {
    arr.sort((a, b) => {
      const an = team.find((m) => m.id === a.assigneeIds[0])?.name || "zzz";
      const bn = team.find((m) => m.id === b.assigneeIds[0])?.name || "zzz";
      return an.localeCompare(bn);
    });
  } else {
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return arr;
}
