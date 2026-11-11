import type { Task, Project, TeamMember, Priority } from "@/types/models";
import { MONTHS, PRIORITIES, addDays, splitModules } from "@/lib/taskHelpers";
import { computeTaskSla, type SlaAll } from "@/lib/taskSla";
import { isOverdue, workDaysAfter, type WorkDays } from "@/lib/workdays";
import { countedTasks } from "@/lib/taskCount";

/** GET /api/reports/insights */
export interface InsightsRaw {
  time: { taskId: string; hours: number; date: string }[];
  closed: { taskId: string; at: string }[];
  reopened: { taskId: string; at: string }[];
}

export interface Month { key: string; label: string } // key "2026-10"

/** The last `count` calendar months up to and including the month of `today`. */
export function lastMonths(today: string, count: number): Month[] {
  const [y, m] = today.split("-").map(Number);
  const out: Month[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push({ key: d.toISOString().slice(0, 7), label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return out;
}

const monthOf = (dateOrIso: string) => dateOrIso.slice(0, 7);
const dayOf = (dateOrIso: string) => dateOrIso.slice(0, 10);

/** Sunday that starts the week containing `date`. */
function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -new Date(y, m - 1, d).getDay());
}

export interface CustomerMonthRow {
  projectId: string; name: string;
  counts: Record<string, number>; total: number; // opened (created) per month
  closed: Record<string, number>; closedTotal: number; // closed (marked Done) per month
}
export interface SlaMonthRow { projectId: string; name: string; met: Record<string, number>; breached: Record<string, number> }
export interface SpeedRow { priority: Priority; label: string; responseHours: number; responseCount: number; resolutionDays: number; resolutionCount: number }
export interface AgeBucket { label: string; count: number }
export interface TopRow { name: string; count: number }
/** Every module (or category) among the period's tickets, plus those with none, so it adds up to the ticket count. */
export interface Breakdown { rows: TopRow[]; notSet: number; tickets: number }
export interface HoursRow { projectId: string; name: string; hours: Record<string, number>; total: number }
export interface TeamRow { id: string; name: string; closed: number; resolutionDays: number; open: number; overdue: number }
export interface WeekRow { week: string; opened: number; closed: number }

export interface Insights {
  months: Month[];
  ticketsPerCustomer: CustomerMonthRow[];
  slaPerCustomer: SlaMonthRow[];
  speed: SpeedRow[];
  ageing: AgeBucket[];
  topModules: Breakdown;
  topCategories: Breakdown;
  hoursPerCustomer: HoursRow[];
  team: TeamRow[];
  weeks: WeekRow[];
  reopenedCount: number;
  closedCount: number;
}

/**
 * Every figure the insight tabs show, from data the page already has plus
 * /api/reports/insights. Sums and counts are kept (not just averages) so the
 * Excel export can rebuild each average and percentage with a formula.
 */
export function computeInsights(input: {
  tasks: Task[];
  projects: Project[];
  team: TeamMember[];
  categoryName: (id: string | null) => string | null;
  slaAll: SlaAll | undefined;
  firstCommentAt: Record<string, string> | undefined;
  raw: InsightsRaw | undefined;
  today: string;
  monthCount: number;
  projectIds: string[];
  /** Only these priorities (empty = all), e.g. ["CRITICAL", "HIGH"]. */
  priorities?: Priority[];
  workDays: WorkDays;
}): Insights {
  const { projects, team, slaAll, firstCommentAt, raw, today, monthCount, projectIds, workDays } = input;
  // Resolution = working days from created to Done − working days spent waiting on the customer.
  const resolutionWorkDays = (t: Task) => Math.max(0, workDaysAfter(dayOf(t.createdAt), t.completedAt!, workDays) - t.pausedDays);
  const months = lastMonths(today, monthCount);
  const from = `${months[0].key}-01`;
  const inPeriod = (d: string | null) => !!d && dayOf(d) >= from && dayOf(d) <= today;
  const priorities = input.priorities ?? [];
  const inProjects = input.tasks.filter((t) =>
    (!projectIds.length || (t.projectId && projectIds.includes(t.projectId))) &&
    (!priorities.length || priorities.includes(t.priority)));
  // Ticket counts are of actual work: tasks with subtasks are left out and
  // their subtasks counted. Hours logged (section 6) still use every task, so
  // time booked on a main task is never lost.
  const tasks = countedTasks(inProjects, input.tasks);
  const taskIds = new Set(tasks.map((t) => t.id));
  const taskById = new Map(inProjects.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const projName = (id: string | null) => (id ? projectById.get(id)?.name ?? "Unknown project" : "No project");
  const created = tasks.filter((t) => inPeriod(t.createdAt));
  const zero = () => Object.fromEntries(months.map((m) => [m.key, 0])) as Record<string, number>;

  // 1 · Tickets per customer (project) per month: opened = created in the month,
  // closed = marked Done in the month (whenever it was created).
  const perCustomer = new Map<string, CustomerMonthRow>();
  const customerRow = (projectId: string | null) => {
    const key = projectId ?? "__none__";
    const row = perCustomer.get(key) ?? { projectId: key, name: projName(projectId), counts: zero(), total: 0, closed: zero(), closedTotal: 0 };
    perCustomer.set(key, row);
    return row;
  };
  for (const t of created) {
    const row = customerRow(t.projectId);
    row.counts[monthOf(t.createdAt)] = (row.counts[monthOf(t.createdAt)] ?? 0) + 1;
    row.total++;
  }

  // 2 · Resolution SLA met / breached per customer per month (by month created).
  const slaRows = new Map<string, SlaMonthRow>();
  // 3 · Response (hours) and resolution (days) per priority.
  const speed = new Map<Priority, SpeedRow>(PRIORITIES.map((p) => [p.id, { priority: p.id, label: p.label, responseHours: 0, responseCount: 0, resolutionDays: 0, resolutionCount: 0 }]));
  const now = new Date();
  for (const t of created) {
    const first = firstCommentAt?.[t.id];
    if (first) {
      const s = speed.get(t.priority)!;
      s.responseHours += Math.max(0, (new Date(first).getTime() - new Date(t.createdAt).getTime()) / 3600000);
      s.responseCount++;
    }
    if (slaAll && t.projectId) {
      const r = computeTaskSla(t, projectById.get(t.projectId), slaAll, first ?? null, now);
      if (r && r.resolution !== "pending") {
        const row = slaRows.get(t.projectId) ?? { projectId: t.projectId, name: projName(t.projectId), met: zero(), breached: zero() };
        const bucket = r.resolution === "met" ? row.met : row.breached;
        bucket[monthOf(t.createdAt)] = (bucket[monthOf(t.createdAt)] ?? 0) + 1;
        slaRows.set(t.projectId, row);
      }
    }
  }
  const completed = tasks.filter((t) => t.status === "DONE" && inPeriod(t.completedAt));
  for (const t of completed) {
    const row = customerRow(t.projectId);
    row.closed[monthOf(t.completedAt!)] = (row.closed[monthOf(t.completedAt!)] ?? 0) + 1;
    row.closedTotal++;
  }
  for (const t of completed) {
    const s = speed.get(t.priority)!;
    s.resolutionDays += resolutionWorkDays(t);
    s.resolutionCount++;
  }

  // 4 · Age of tickets open today, in working days.
  const open = tasks.filter((t) => t.status !== "DONE");
  const ages = open.map((t) => workDaysAfter(dayOf(t.createdAt), today, workDays));
  const ageing: AgeBucket[] = [
    { label: "0–7 days", count: ages.filter((a) => a <= 7).length },
    { label: "8–30 days", count: ages.filter((a) => a >= 8 && a <= 30).length },
    { label: "31–60 days", count: ages.filter((a) => a >= 31 && a <= 60).length },
    { label: "60+ days", count: ages.filter((a) => a > 60).length },
  ];

  // 5 · Top 5 modules and categories among tickets created in the period.
  // 5 · Every module and category among tickets created in the period, most first,
  // plus "Not set" for tickets with none. A ticket with several modules counts
  // once under each, so module rows can add up to more than the ticket count.
  const breakdown = (namesPerTicket: string[][]): Breakdown => {
    const counts = new Map<string, number>();
    let notSet = 0;
    namesPerTicket.forEach((names) => {
      if (names.length === 0) notSet++;
      names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    });
    const rows = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { rows, notSet, tickets: namesPerTicket.length };
  };
  const topModules = breakdown(created.map((t) => splitModules(t.module)));
  const topCategories = breakdown(created.map((t) => {
    const name = input.categoryName(t.categoryId);
    return name ? [name] : [];
  }));

  // 6 · Hours logged per customer per month.
  const hours = new Map<string, HoursRow>();
  for (const e of raw?.time ?? []) {
    const t = taskById.get(e.taskId);
    if (!t || !inPeriod(e.date)) continue;
    const key = t.projectId ?? "__none__";
    const row = hours.get(key) ?? { projectId: key, name: projName(t.projectId), hours: zero(), total: 0 };
    row.hours[monthOf(e.date)] = (row.hours[monthOf(e.date)] ?? 0) + e.hours;
    row.total += e.hours;
    hours.set(key, row);
  }

  // 7 · Per person: closed in the period, total resolution days, open and overdue today.
  const teamRows: TeamRow[] = team.filter((m) => m.active).map((m) => {
    const mineDone = completed.filter((t) => t.assigneeIds.includes(m.id));
    const mineOpen = open.filter((t) => t.assigneeIds.includes(m.id));
    return {
      id: m.id,
      name: m.name,
      closed: mineDone.length,
      resolutionDays: mineDone.reduce((sum, t) => sum + resolutionWorkDays(t), 0),
      open: mineOpen.length,
      overdue: mineOpen.filter((t) => isOverdue(t, today, workDays)).length,
    };
  }).filter((r) => r.closed > 0 || r.open > 0).sort((a, b) => b.closed - a.closed || b.open - a.open);

  // 8 · Opened vs closed per week (Sunday–Saturday), last 12 weeks of the period.
  const firstWeek = weekStart(from);
  const weekKeys: string[] = [];
  for (let w = weekStart(today); w >= firstWeek && weekKeys.length < 12; w = addDays(w, -7)) weekKeys.unshift(w);
  const weeks: WeekRow[] = weekKeys.map((week) => ({ week, opened: 0, closed: 0 }));
  const weekIdx = new Map(weekKeys.map((w, i) => [w, i]));
  for (const t of tasks) {
    const oi = weekIdx.get(weekStart(dayOf(t.createdAt)));
    if (oi !== undefined) weeks[oi].opened++;
    if (t.status === "DONE" && t.completedAt) {
      const ci = weekIdx.get(weekStart(t.completedAt));
      if (ci !== undefined) weeks[ci].closed++;
    }
  }

  // 9 · Reopened ÷ closed, counting each ticket once.
  const closedIds = new Set<string>(completed.map((t) => t.id));
  (raw?.closed ?? []).forEach((c) => { if (taskIds.has(c.taskId) && inPeriod(c.at)) closedIds.add(c.taskId); });
  const reopenedIds = new Set<string>();
  (raw?.reopened ?? []).forEach((r) => { if (taskIds.has(r.taskId) && inPeriod(r.at)) { reopenedIds.add(r.taskId); closedIds.add(r.taskId); } });

  const byTotal = <T extends { total: number }>(rows: Iterable<T>) => [...rows].sort((a, b) => b.total - a.total);
  return {
    months,
    ticketsPerCustomer: byTotal(perCustomer.values()),
    slaPerCustomer: [...slaRows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    speed: [...speed.values()],
    ageing,
    topModules,
    topCategories,
    hoursPerCustomer: byTotal(hours.values()),
    team: teamRows,
    weeks,
    reopenedCount: reopenedIds.size,
    closedCount: closedIds.size,
  };
}
