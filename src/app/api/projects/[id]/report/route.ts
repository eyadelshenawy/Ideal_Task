import { countedTasks } from "@/lib/taskCount";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadWorkDays } from "@/lib/scheduling";
import { isOverdue, workDaysAfter } from "@/lib/workdays";
import type { Priority } from "@prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { responseSlaState, resolutionSlaState } from "@/lib/sla";
import { totalPausedMinutes } from "@/lib/pause";
import { loadSlaConfig, loadDefaultSlaConfig, loadBusinessCalendar, clockFor } from "@/lib/slaConfig";
import { dateStrToUTC } from "@/lib/serverDates";

const PRIORITY_IDS: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// A one-page, print-ready snapshot of a project for sending to a client —
// counts + completion rate, and (for SLA-tracked projects) a response/
// resolution breakdown. Same completion-rate math as the public share page,
// just reachable only from inside the app (an admin generates it, then
// saves/emails the resulting PDF themselves — this isn't a standing public
// link like /share/[token]).
//
// The snapshot counts (total/open/done/overdue/completion) are always
// "right now" — there's no historical snapshot of past task state to report
// against. An optional ?from=&to= adds a period section on top of that
// (created/completed within the range), the same idea as the Reports tab's
// "Last 7 Days" but with a range the caller picks.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireProjectAccess(params.id);
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, code: true, deletedAt: true, slaTrackingEnabled: true, slaBusinessHours: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // isPrivate is excluded even though requireProjectAccess already gates
  // this to project admins — a private task's whole point is that it never
  // rolls up into any operational counts anywhere.
  const allTasks = await prisma.task.findMany({
    where: { projectId: project.id, deletedAt: null, isPrivate: false },
    select: {
      id: true, parentId: true, code: true, title: true, priority: true, status: true, startDate: true, dueDate: true,
      createdAt: true, completedAt: true, updatedAt: true, pausedAt: true, pausedMinutes: true, pausedDays: true,
    },
  });
  // Optional ?priorities=CRITICAL,HIGH narrows everything to those priorities.
  const priorities = (req.nextUrl.searchParams.get("priorities") ?? "")
    .split(",").map((p) => p.trim().toUpperCase()).filter((p): p is Priority => (PRIORITY_IDS as string[]).includes(p));
  // Counts are of actual work: a task with subtasks is left out and its subtasks are counted.
  const tasks = countedTasks(allTasks).filter((t) => priorities.length === 0 || priorities.includes(t.priority));

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = day(new Date());
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const workDays = await loadWorkDays();
  const lateNow = (t: (typeof tasks)[number]) => isOverdue({ status: t.status, dueDate: t.dueDate ? day(t.dueDate) : null }, today, workDays);
  const overdue = tasks.filter(lateNow).length;
  // When a task was closed: completedAt, or its last update for older rows without one.
  const closedAt = (t: (typeof tasks)[number]) => t.completedAt ?? t.updatedAt;
  // Resolution = working days from created to Done − working days waiting on the customer.
  const resolutionDays = (t: (typeof tasks)[number]) => Math.max(0, workDaysAfter(day(t.createdAt), day(closedAt(t)), workDays) - t.pausedDays);

  const fromStr = req.nextUrl.searchParams.get("from");
  const toStr = req.nextUrl.searchParams.get("to");
  const from = fromStr ? dateStrToUTC(fromStr) : null;
  const to = toStr ? new Date(dateStrToUTC(toStr)!.getTime() + 86400000) : null; // inclusive of the whole "to" day
  const inRange = (d: Date) => !from || !to || (d >= from && d < to);
  const createdInPeriod = tasks.filter((t) => inRange(t.createdAt));
  const resolvedInPeriod = tasks.filter((t) => t.status === "DONE" && inRange(closedAt(t)));

  let period: {
    from: string; to: string; created: number; completed: number;
    resolutionDaysSum: number; avgResolutionDays: number | null;
    months: { month: string; created: number; resolved: number }[];
  } | null = null;
  if (fromStr && toStr && from && to) {
    // One row per calendar month the period touches (at most 24).
    const months: { month: string; created: number; resolved: number }[] = [];
    for (let y = from.getUTCFullYear(), m = from.getUTCMonth(); months.length < 24; m++) {
      if (m === 12) { m = 0; y++; }
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      if (key > toStr.slice(0, 7)) break;
      months.push({ month: key, created: 0, resolved: 0 });
    }
    const monthRow = new Map(months.map((r) => [r.month, r]));
    createdInPeriod.forEach((t) => { const r = monthRow.get(day(t.createdAt).slice(0, 7)); if (r) r.created++; });
    resolvedInPeriod.forEach((t) => { const r = monthRow.get(day(closedAt(t)).slice(0, 7)); if (r) r.resolved++; });
    const resolutionDaysSum = resolvedInPeriod.reduce((sum, t) => sum + resolutionDays(t), 0);
    period = {
      from: fromStr,
      to: toStr,
      created: createdInPeriod.length,
      completed: resolvedInPeriod.length,
      resolutionDaysSum,
      avgResolutionDays: resolvedInPeriod.length > 0 ? Math.round((resolutionDaysSum / resolvedInPeriod.length) * 10) / 10 : null,
      months,
    };
  }

  let sla: {
    response: { met: number; breached: number; pending: number };
    resolution: { met: number; breached: number; pending: number };
    byPriority: { priority: Priority; met: number; breached: number; pending: number }[];
  } | null = null;

  if (project.slaTrackingEnabled) {
    const config = (await loadSlaConfig(project.id)) ?? (await loadDefaultSlaConfig());
    const clock = clockFor(project.slaBusinessHours, await loadBusinessCalendar());
    // With a period, SLA covers the tickets created in it; without one, every ticket.
    const base = period ? createdInPeriod : tasks;
    const inScope = config.cutoffDate
      ? base.filter((t) => day(t.createdAt) >= config.cutoffDate!)
      : base;

    const comments = await prisma.taskEvent.findMany({
      where: { taskId: { in: inScope.map((t) => t.id) }, type: "COMMENT" },
      select: { taskId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const firstCommentAt = new Map<string, string>();
    for (const c of comments) {
      if (!firstCommentAt.has(c.taskId)) firstCommentAt.set(c.taskId, c.createdAt.toISOString());
    }

    const now = new Date();
    const tally = { met: 0, breached: 0, pending: 0 };
    const response = { ...tally };
    const resolution = { ...tally };
    const byPriority = new Map<Priority, { priority: Priority; met: number; breached: number; pending: number }>();
    for (const t of inScope) {
      const createdAtIso = t.createdAt.toISOString();
      response[responseSlaState(t.priority, createdAtIso, firstCommentAt.get(t.id) ?? null, now, config.targets, clock)]++;
      const state = resolutionSlaState(t.priority, createdAtIso, t.completedAt ? t.completedAt.toISOString() : null, now, config.targets, clock, totalPausedMinutes(t, now, clock));
      resolution[state]++;
      const row = byPriority.get(t.priority) ?? { priority: t.priority, met: 0, breached: 0, pending: 0 };
      row[state]++;
      byPriority.set(t.priority, row);
    }
    sla = { response, resolution, byPriority: PRIORITY_IDS.flatMap((p) => byPriority.get(p) ?? []) };
  }

  // Open tickets, oldest first, with their age in working days.
  const openTickets = tasks
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 100)
    .map((t) => ({
      code: t.code, title: t.title, priority: t.priority, status: t.status,
      created: day(t.createdAt), dueDate: t.dueDate ? day(t.dueDate) : null,
      ageDays: workDaysAfter(day(t.createdAt), today, workDays),
      overdue: lateNow(t),
    }));

  return NextResponse.json({
    projectName: project.name,
    projectCode: project.code,
    generatedAt: new Date().toISOString(),
    priorities,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    counts: { total, done, open: total - done, overdue },
    sla,
    period,
    openTickets,
    openCount: total - done,
  });
}
