import type { Task, Project, TeamMember } from "@/types/models";
import type { SlaConfigDto } from "@/lib/slaConfig";
import { computeTaskSla, type SlaAll } from "@/lib/taskSla";
import { countsAsResolved } from "@/lib/closeReason";
import { isOverdue, type WorkDays } from "@/lib/workdays";

// The Reports → Overview figures, shared by ReportsView and the MCP
// get_report tool so both compute them the same way. `counted` is already
// passed through countedTasks (tasks with subtasks left out).

/** SLA met % for response and resolution, and the breached tickets. */
export function computeSlaSummary(counted: Task[], projects: Project[], slaAll: SlaAll, firstCommentAt: Record<string, string>) {
  const now = new Date();
  const trackedProjectIds = new Set(projects.filter((p) => p.slaTrackingEnabled).map((p) => p.id));
  // Closed as Not applicable / Duplicate / Cancelled: no SLA to meet.
  const tracked = counted.filter((t) => t.projectId && trackedProjectIds.has(t.projectId) && countsAsResolved(t));

  const configFor = (projectId: string): SlaConfigDto => slaAll.overrides[projectId] ?? slaAll.default;
  const inScope = tracked.filter((t) => {
    const cutoff = configFor(t.projectId!).cutoffDate;
    return !cutoff || t.createdAt.slice(0, 10) >= cutoff;
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const rows = inScope.flatMap((t) => {
    const r = computeTaskSla(t, projectById.get(t.projectId!), slaAll, firstCommentAt[t.id] ?? null, now);
    return r ? [{ task: t, response: r.response, resolution: r.resolution }] : [];
  });
  const decided = (state: "response" | "resolution") => rows.filter((r) => r[state] !== "pending");
  const met = (state: "response" | "resolution") => decided(state).filter((r) => r[state] === "met").length;
  const rate = (state: "response" | "resolution") => {
    const d = decided(state);
    if (d.length === 0) return null;
    return Math.round((met(state) / d.length) * 100);
  };
  const breached = rows.filter((r) => r.response === "breached" || r.resolution === "breached");
  return {
    responseRate: rate("response"),
    resolutionRate: rate("resolution"),
    responseMet: met("response"),
    responseDecided: decided("response").length,
    resolutionMet: met("resolution"),
    resolutionDecided: decided("resolution").length,
    breached,
    excludedCount: tracked.length - inScope.length,
    trackedCount: tracked.length,
  };
}

/** Totals, completion rate and the last-7-days counts. */
export function computeOverall(counted: Task[], today: string, sevenDaysAgo: string, workDays: WorkDays) {
  const total = counted.length;
  const done = counted.filter((t) => t.status === "DONE").length;
  const inProgress = counted.filter((t) => t.status === "INPROGRESS").length;
  const overdue = counted.filter((t) => isOverdue(t, today, workDays)).length;
  const createdLast7 = counted.filter((t) => t.createdAt >= sevenDaysAgo).length;
  const completedLast7 = counted.filter((t) => t.status === "DONE" && t.updatedAt >= sevenDaysAgo).length;
  return {
    total, done, inProgress, overdue,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    createdLast7, completedLast7,
  };
}

/**
 * Open (non-Done) work per person, heaviest first. A task with several
 * assignees counts toward each of them.
 */
export function computeWorkload(counted: Task[], team: TeamMember[], today: string, workDays: WorkDays) {
  const open = counted.filter((t) => t.status !== "DONE");
  const rows = team.filter((m) => m.active).map((m) => {
    const mine = open.filter((t) => t.assigneeIds.includes(m.id));
    const overdue = mine.filter((t) => isOverdue(t, today, workDays)).length;
    const highPriority = mine.filter((t) => t.priority === "CRITICAL" || t.priority === "HIGH").length;
    return { id: m.id, name: m.name, total: mine.length, overdue, highPriority };
  });
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  return rows.sort((a, b) => b.total - a.total).map((r) => ({ ...r, barPct: Math.round((r.total / maxTotal) * 100) }));
}
