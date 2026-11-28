import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Task, Project, TeamMember, Priority } from "@/types/models";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { countedTasks } from "@/lib/taskCount";
import { computeInsights, lastMonths } from "@/lib/reportInsights";
import { computeOverall, computeSlaSummary, computeWorkload } from "@/lib/reportOverview";
import { buildClientReport } from "@/lib/reports/clientReport";
import { csatSummary } from "@/lib/reports/csat";
import { hoursByPerson } from "@/lib/reports/hoursByPerson";
import { insightsRaw, firstCommentTimes } from "@/lib/reports/insightsData";
import { loadWorkDays } from "@/lib/scheduling";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides, loadBusinessCalendar } from "@/lib/slaConfig";
import { addDays, PRIORITIES } from "@/lib/taskHelpers";
import type { SlaAll } from "@/lib/taskSla";

// The reports IDT Desk shows (Reports → Overview and its tabs, the Client
// report), for ONE project, as raw numbers plus the definition behind each
// figure. Every figure comes from the same functions the screens use:
// computeInsights, src/lib/reportOverview.ts and src/lib/reports/*.

type Param = { name: string; type: string; required: boolean; description: string };

const FROM: Param = { name: "from", type: "date (YYYY-MM-DD)", required: false, description: "Start of the period" };
const TO: Param = { name: "to", type: "date (YYYY-MM-DD)", required: false, description: "End of the period (inclusive). Default: today" };
const PRIOS: Param = { name: "priorities", type: "list of CRITICAL | HIGH | MEDIUM | LOW", required: false, description: "Only tickets with these priorities. Default: all" };
const MONTHLY_NOTE = "Months run from the month of `from` to the month of `to` (default: the last 6 months, as on the Reports page).";

export const REPORTS: { id: string; name: string; description: string; screen: string; parameters: Param[] }[] = [
  {
    id: "overview",
    name: "Overview",
    screen: "Reports → Overview",
    description: "Ticket totals, completion rate, overdue, last 7 days, SLA met % and open work per person, as of now.",
    parameters: [],
  },
  {
    id: "client_report",
    name: "Client report",
    screen: "Reports → Client report (print / PDF)",
    description: "The report sent to the client: counts and completion rate now; with a period, tickets received and resolved, closure reasons, average resolution and a month-by-month table; SLA per priority (SLA projects); open tickets with their age.",
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "customers",
    name: "Tickets opened and closed per month",
    screen: "Reports → Customers",
    description: `Tickets opened (created) and closed (marked Done) per month. ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "sla_speed",
    name: "SLA and speed",
    screen: "Reports → SLA & speed",
    description: `Resolution SLA met / breached per month, average response and resolution time per priority, age of open tickets, and the SLA summary. ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "breakdown",
    name: "Modules and categories",
    screen: "Reports → Customers (modules / categories)",
    description: `Tickets created in the period per module and per category, with "Not set". ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "team",
    name: "Team",
    screen: "Reports → Team",
    description: `Per person: tickets closed and resolved in the period, resolution days, and open / overdue today. ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "time_billing",
    name: "Time and billing",
    screen: "Reports → Time & billing",
    description: `Hours logged per month, and hours per person between from and to (default: the last 7 days). ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "quality",
    name: "Quality",
    screen: "Reports → Quality",
    description: `Tickets opened vs closed per week (last 12 weeks of the period) and the reopen rate. ${MONTHLY_NOTE}`,
    parameters: [FROM, TO, PRIOS],
  },
  {
    id: "satisfaction",
    name: "Customer satisfaction",
    screen: "Reports → Overview (Customer satisfaction)",
    description: "Surveys sent and answered, average rating (1–5) and the 10 latest ratings. All time.",
    parameters: [],
  },
];

export class ReportError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayUtc = () => new Date().toISOString().slice(0, 10);

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function parseArgs(args: { from?: string; to?: string; priorities?: unknown }) {
  const to = args.to ?? todayUtc();
  if (!DATE_RE.test(to)) throw new ReportError('"to" must be a date like 2026-11-30');
  if (args.from !== undefined && !DATE_RE.test(args.from)) throw new ReportError('"from" must be a date like 2026-11-01');
  if (args.from && args.from > to) throw new ReportError('"from" must be on or before "to"');
  let priorities: Priority[] = [];
  if (args.priorities !== undefined) {
    const list = Array.isArray(args.priorities) ? args.priorities : typeof args.priorities === "string" ? args.priorities.split(",") : null;
    if (!list) throw new ReportError('"priorities" must be a list such as ["CRITICAL", "HIGH"]');
    priorities = list.map((p) => String(p).trim().toUpperCase()).filter(Boolean) as Priority[];
    const bad = priorities.find((p) => !PRIORITIES.some((x) => x.id === p));
    if (bad) throw new ReportError(`Unknown priority "${bad}". Use CRITICAL, HIGH, MEDIUM or LOW`);
  }
  const monthCount = args.from ? monthsBetween(args.from, to) : 6;
  if (monthCount > 24) throw new ReportError("The period can be at most 24 months");
  return { from: args.from, to, priorities, monthCount };
}

/** Everything the Reports screen loads, for one project, built on the server. */
async function loadProjectData(projectId: string) {
  const taskWhere: Prisma.TaskWhereInput = { projectId, deletedAt: null, isPrivate: false, onHoldAt: null };
  const [rows, projectRow, users, categories, defaultSla, overrides, calendar, workDays] = await Promise.all([
    prisma.task.findMany({ where: taskWhere, include: taskInclude, orderBy: { createdAt: "asc" } }),
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    loadDefaultSlaConfig(),
    loadAllProjectSlaOverrides(),
    loadBusinessCalendar(),
    loadWorkDays(),
  ]);
  const tasks: Task[] = rows.map(serializeTask);
  // Same shape the screen gets from /api/projects (dates as text).
  const project = JSON.parse(JSON.stringify(projectRow)) as Project;
  const team: TeamMember[] = users.map((u) => ({ ...u, projectAdminOf: [] }) as TeamMember);
  const slaAll: SlaAll = { default: defaultSla, overrides, calendar };
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return { taskWhere, tasks, project, team, slaAll, workDays, categoryName: (id: string | null) => (id ? catName.get(id) ?? null : null) };
}

const userNames = async (ids: string[]) =>
  new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

export async function runReport(
  project: { id: string; code: string; name: string },
  reportId: string,
  args: { from?: string; to?: string; priorities?: unknown },
) {
  const report = REPORTS.find((r) => r.id === reportId);
  if (!report) throw new ReportError(`Unknown report "${reportId}". Call list_reports to see the reports for ${project.code}.`);
  const p = parseArgs(args);
  const header = { report: report.id, name: report.name, screen: report.screen, project: project.code, generatedAt: new Date().toISOString() };

  if (report.id === "client_report") {
    const data = await buildClientReport(project.id, {
      from: p.from ?? null,
      to: p.from ? p.to : null,
      priorities: p.priorities.join(","),
    });
    if (!data) throw new ReportError("Project not found");
    return {
      ...header,
      parameters: { from: p.from ?? null, to: p.from ? p.to : null, priorities: p.priorities },
      data,
      definitions: {
        "counts.total": "Tickets in the project now (a task with subtasks is left out and its subtasks counted; private, Trash and on-hold tasks excluded)",
        "counts.done": "Of those, status = Done",
        "counts.open": "total − done",
        "counts.overdue": "Not Done and past the due date (working days)",
        completionRate: "round(done ÷ total × 100)",
        "period.created": "Tickets created between from and to",
        "period.completed": "Tickets marked Done between from and to (completedAt, else last update)",
        "period.byReason": "period.completed split by closure reason",
        "period.resolutionDaysSum": "Σ working days from created to Done − working days waiting on the customer, Resolved only",
        "period.avgResolutionDays": "round(resolutionDaysSum ÷ count of Resolved, 1 decimal)",
        "period.months": "Per calendar month: created, and resolved (marked Done)",
        sla: "SLA projects only. Response = first comment before the response deadline; resolution = Done before the resolution deadline (clock paused while waiting on the customer). met / breached / pending, Resolved and still-open tickets only; with a period, tickets created in it",
        openTickets: "Open tickets, oldest first (max 100); ageDays = working days since created",
      },
    };
  }

  const d = await loadProjectData(project.id);
  const counted = countedTasks(d.tasks);

  if (report.id === "overview") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = todayUtc();
    const firstCommentAt = await firstCommentTimes(d.tasks.map((t) => t.id));
    const sla = computeSlaSummary(counted, [d.project], d.slaAll, firstCommentAt);
    return {
      ...header,
      parameters: {},
      data: {
        totals: computeOverall(counted, today, sevenDaysAgo, d.workDays),
        sla: d.project.slaTrackingEnabled
          ? {
              responseRate: sla.responseRate, responseMet: sla.responseMet, responseDecided: sla.responseDecided,
              resolutionRate: sla.resolutionRate, resolutionMet: sla.resolutionMet, resolutionDecided: sla.resolutionDecided,
              trackedCount: sla.trackedCount, excludedBeforeCutoff: sla.excludedCount,
              breached: sla.breached.map((r) => ({ code: r.task.code, title: r.task.title, response: r.response, resolution: r.resolution })),
            }
          : null,
        workload: computeWorkload(counted, d.team, today, d.workDays).filter((r) => r.total > 0).map(({ barPct: _bar, id: _id, ...r }) => r),
      },
      definitions: {
        "totals.total": "Tickets now (a task with subtasks is left out and its subtasks counted)",
        "totals.done / inProgress": "Count with that status",
        "totals.overdue": "Not Done and past the due date (working days)",
        "totals.completionRate": "round(done ÷ total × 100)",
        "totals.createdLast7": "Created in the last 7 days",
        "totals.completedLast7": "Done and last updated in the last 7 days",
        "sla.responseRate": "round(responseMet ÷ responseDecided × 100); decided = met + breached (pending left out)",
        "sla.resolutionRate": "round(resolutionMet ÷ resolutionDecided × 100)",
        "sla.trackedCount": "Tickets in scope: Resolved or open (Not applicable / Duplicate / Cancelled left out)",
        "workload.total": "Open tickets assigned to the person (a ticket with several assignees counts for each)",
        "workload.highPriority": "Of those, Critical or High",
      },
    };
  }

  if (report.id === "satisfaction") {
    const s = await csatSummary({ projectId: project.id, isPrivate: false, onHoldAt: null });
    return {
      ...header,
      parameters: {},
      data: { sent: s.sent, responded: s.responded, average: s.average, recent: s.recent.map(({ taskId: _t, ...r }) => r) },
      definitions: {
        sent: "Satisfaction surveys sent (one per ticket closed with a customer email)",
        responded: "Surveys with a rating",
        average: "round(Σ ratings ÷ responded, 1 decimal); scale 1–5",
        recent: "The 10 latest ratings",
      },
    };
  }

  // The insight tabs: computeInsights exactly as the Reports page calls it.
  const months = lastMonths(p.to, p.monthCount);
  const insightsFrom = `${months[0].key}-01`;
  const [raw, firstCommentAt] = await Promise.all([
    insightsRaw(d.taskWhere, new Date(`${insightsFrom}T00:00:00.000Z`)),
    firstCommentTimes(d.tasks.map((t) => t.id)),
  ]);
  const ins = computeInsights({
    tasks: d.tasks, projects: [d.project], team: d.team, categoryName: d.categoryName,
    slaAll: d.slaAll, firstCommentAt, raw, today: p.to, monthCount: p.monthCount,
    projectIds: [project.id], priorities: p.priorities, workDays: d.workDays,
  });
  const period = { months: ins.months.map((m) => m.key), from: insightsFrom, to: p.to, priorities: p.priorities };
  const monthly = (rec: Record<string, number> | undefined) => ins.months.map((m) => ({ month: m.key, value: rec?.[m.key] ?? 0 }));
  const one = <T>(rows: T[]) => rows[0];

  if (report.id === "customers") {
    const row = one(ins.ticketsPerCustomer);
    return {
      ...header,
      parameters: period,
      data: {
        months: ins.months.map((m) => ({ month: m.key, opened: row?.counts[m.key] ?? 0, closed: row?.closed[m.key] ?? 0 })),
        totals: { opened: row?.total ?? 0, closed: row?.closedTotal ?? 0 },
      },
      definitions: {
        opened: "Tickets created in the month (a task with subtasks is left out and its subtasks counted)",
        closed: "Tickets marked Done in the month (completedAt), whenever they were created",
        "totals.opened": "Σ opened over the months",
        "totals.closed": "Σ closed over the months",
      },
    };
  }

  if (report.id === "sla_speed") {
    const slaRow = one(ins.slaPerCustomer);
    const sla = computeSlaSummary(
      counted.filter((t) => p.priorities.length === 0 || p.priorities.includes(t.priority)),
      [d.project], d.slaAll, firstCommentAt,
    );
    return {
      ...header,
      parameters: period,
      data: {
        slaTracked: !!d.project.slaTrackingEnabled,
        slaByMonth: ins.months.map((m) => ({ month: m.key, met: slaRow?.met[m.key] ?? 0, breached: slaRow?.breached[m.key] ?? 0 })),
        speedByPriority: ins.speed.map((s) => ({
          priority: s.priority,
          responseHoursSum: Math.round(s.responseHours * 100) / 100, responseCount: s.responseCount,
          avgResponseHours: s.responseCount ? Math.round((s.responseHours / s.responseCount) * 10) / 10 : null,
          resolutionDaysSum: s.resolutionDays, resolutionCount: s.resolutionCount,
          avgResolutionDays: s.resolutionCount ? Math.round((s.resolutionDays / s.resolutionCount) * 10) / 10 : null,
        })),
        ageingOpenTickets: ins.ageing,
        slaSummaryNow: d.project.slaTrackingEnabled
          ? { responseRate: sla.responseRate, responseMet: sla.responseMet, responseDecided: sla.responseDecided, resolutionRate: sla.resolutionRate, resolutionMet: sla.resolutionMet, resolutionDecided: sla.resolutionDecided, breachedCount: sla.breached.length }
          : null,
      },
      definitions: {
        slaByMonth: "Tickets created in the month whose resolution SLA is decided: met = Done before the deadline, breached = Done late or still open past it (pending left out; Not applicable / Duplicate / Cancelled left out)",
        avgResponseHours: "responseHoursSum ÷ responseCount; response = hours from created to first comment, tickets created in the period",
        avgResolutionDays: "resolutionDaysSum ÷ resolutionCount; resolution = working days from created to Done − working days waiting on the customer, Resolved tickets marked Done in the period",
        ageingOpenTickets: "Open tickets by working days since created, as of `to`",
        slaSummaryNow: "As on Reports → SLA box: rate = round(met ÷ decided × 100), all tickets in scope now",
      },
    };
  }

  if (report.id === "breakdown") {
    return {
      ...header,
      parameters: period,
      data: { modules: ins.topModules, categories: ins.topCategories },
      definitions: {
        "modules.rows": "Tickets created in the period per module, most first. A ticket with several modules counts once under each, so rows can add up to more than `tickets`",
        "categories.rows": "Tickets created in the period per category",
        notSet: "Tickets with no module (or no category)",
        tickets: "Tickets created in the period",
      },
    };
  }

  if (report.id === "team") {
    return {
      ...header,
      parameters: period,
      data: {
        people: ins.team.map((r) => ({
          name: r.name, closed: r.closed, resolved: r.resolved, resolutionDaysSum: r.resolutionDays,
          avgResolutionDays: r.resolved ? Math.round((r.resolutionDays / r.resolved) * 10) / 10 : null,
          openToday: r.open, overdueToday: r.overdue,
          overduePercent: r.open ? Math.round((r.overdue / r.open) * 100) : null,
        })),
      },
      definitions: {
        closed: "Tickets assigned to the person and marked Done in the period",
        resolved: "Of those, closure reason Resolved",
        avgResolutionDays: "resolutionDaysSum ÷ resolved (working days, waiting on the customer excluded)",
        openToday: "Open tickets assigned to the person, as of `to`",
        overdueToday: "Of those, past the due date",
        overduePercent: "round(overdueToday ÷ openToday × 100)",
      },
    };
  }

  if (report.id === "time_billing") {
    const row = one(ins.hoursPerCustomer);
    const personFrom = p.from ?? addDays(p.to, -6);
    const perPerson = await hoursByPerson(d.taskWhere, personFrom, p.to);
    const names = await userNames(Object.keys(perPerson));
    const people = Object.entries(perPerson).map(([id, hours]) => ({ name: names.get(id) ?? "Former member", hours })).sort((a, b) => b.hours - a.hours);
    return {
      ...header,
      parameters: { ...period, hoursByPersonFrom: personFrom, hoursByPersonTo: p.to },
      data: {
        hoursByMonth: monthly(row?.hours),
        totalHours: row?.total ?? 0,
        hoursByPerson: people,
        hoursByPersonTotal: people.reduce((a, r) => a + r.hours, 0),
      },
      definitions: {
        hoursByMonth: "Σ hours logged in the month on the project's tasks (every task, main tasks included)",
        totalHours: "Σ hoursByMonth",
        hoursByPerson: "Σ hours each person logged between hoursByPersonFrom and hoursByPersonTo",
      },
    };
  }

  // quality
  return {
    ...header,
    parameters: period,
    data: {
      weeks: ins.weeks,
      reopened: ins.reopenedCount,
      closed: ins.closedCount,
      reopenRatePercent: ins.closedCount ? Math.round((ins.reopenedCount / ins.closedCount) * 100) : null,
    },
    definitions: {
      weeks: "Per week (Sunday start, last 12 weeks of the period): opened = created that week, closed = marked Done that week",
      reopened: "Tickets moved from Done back to another status in the period, each counted once",
      closed: "Tickets closed in the period, each counted once (from the status history)",
      reopenRatePercent: "round(reopened ÷ closed × 100)",
    },
  };
}
