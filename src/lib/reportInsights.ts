import type { Task, Project, TeamMember, Priority } from "@/types/models";
import { MONTHS, PRIORITIES, addDays, splitModules } from "@/lib/taskHelpers";
import { computeTaskSla, type SlaAll } from "@/lib/taskSla";
import { isOverdue, workDaysAfter, type WorkDays } from "@/lib/workdays";

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

export interface CustomerMonthRow { projectId: string; name: string; counts: Record<string, number>; total: number }
export interface SlaMonthRow { projectId: string; name: string; met: Record<string, number>; breached: Record<string, number> }
export interface SpeedRow { priority: Priority; label: string; responseHours: number; responseCount: number; resolutionDays: number; resolutionCount: number }
export interface AgeBucket { label: string; count: number }
export interface TopRow { name: string; count: number }
export interface HoursRow { projectId: string; name: string; hours: Record<string, number>; total: number }
export interface TeamRow { id: string; name: string; closed: number; resolutionDays: number; open: number; overdue: number }
export interface WeekRow { week: string; opened: number; closed: number }

export interface Insights {
  months: Month[];
  ticketsPerCustomer: CustomerMonthRow[];
  slaPerCustomer: SlaMonthRow[];
  speed: SpeedRow[];
  ageing: AgeBucket[];
  topModules: TopRow[];
  topCategories: TopRow[];
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
  workDays: WorkDays;
}): Insights {
  const { projects, team, slaAll, firstCommentAt, raw, today, monthCount, projectIds, workDays } = input;
  const months = lastMonths(today, monthCount);
  const from = `${months[0].key}-01`;
  const inPeriod = (d: string | null) => !!d && dayOf(d) >= from && dayOf(d) <= today;
  const tasks = projectIds.length ? input.tasks.filter((t) => t.projectId && projectIds.includes(t.projectId)) : input.tasks;
  const taskIds = new Set(tasks.map((t) => t.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const projName = (id: string | null) => (id ? projectById.get(id)?.name ?? "Unknown project" : "No project");
  const created = tasks.filter((t) => inPeriod(t.createdAt));
  const zero = () => Object.fromEntries(months.map((m) => [m.key, 0])) as Record<string, number>;

  // 1 · Tickets created per customer (project) per month.
  const perCustomer = new Map<string, CustomerMonthRow>();
  for (const t of created) {
    const key = t.projectId ?? "__none__";
    const row = perCustomer.get(key) ?? { projectId: key, name: projName(t.projectId), counts: zero(), total: 0 };
    row.counts[monthOf(t.createdAt)] = (row.counts[monthOf(t.createdAt)] ?? 0) + 1;
    row.total++;
    perCustomer.set(key, row);
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
    const s = speed.get(t.priority)!;
    s.resolutionDays += workDaysAfter(dayOf(t.createdAt), t.completedAt!, workDays);
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
  const top = (names: (string | null)[]) => {
    const counts = new Map<string, number>();
    names.forEach((n) => { if (n) counts.set(n, (counts.get(n) ?? 0) + 1); });
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  };
  const topModules = top(created.flatMap((t) => splitModules(t.module)));
  const topCategories = top(created.map((t) => input.categoryName(t.categoryId)));

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
      resolutionDays: mineDone.reduce((sum, t) => sum + workDaysAfter(dayOf(t.createdAt), t.completedAt!, workDays), 0),
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
