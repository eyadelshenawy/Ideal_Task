import type { CSSProperties } from "react";
import type { Priority, Status, Task, TeamMember } from "@/types/models";

// Ported from ideal-tasks.jsx, with enum ids uppercased to match the Prisma schema.

export const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: "HIGH", label: "High", color: "#C4443D" },
  { id: "MEDIUM", label: "Medium", color: "#D98B3A" },
  { id: "LOW", label: "Low", color: "#6B8F80" },
];

export const STATUSES: { id: Status; label: string; color: string }[] = [
  { id: "TODO", label: "To Do", color: "#8A8F8C" },
  { id: "INPROGRESS", label: "In Progress", color: "#82B478" },
  { id: "REVIEW", label: "Review", color: "#D98B3A" },
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

export type SortBy = "dueDate" | "priority" | "assignee" | "created";

export function sortTasks(list: Task[], sortBy: SortBy, team: TeamMember[]): Task[] {
  const arr = [...list];
  if (sortBy === "dueDate") {
    arr.sort((a, b) => ((a.dueDate || "9999-99-99") < (b.dueDate || "9999-99-99") ? -1 : 1));
  } else if (sortBy === "priority") {
    arr.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
  } else if (sortBy === "assignee") {
    arr.sort((a, b) => {
      const an = team.find((m) => m.id === a.assigneeId)?.name || "zzz";
      const bn = team.find((m) => m.id === b.assigneeId)?.name || "zzz";
      return an.localeCompare(bn);
    });
  } else {
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return arr;
}
