import type { Prisma, PrismaClient } from "@prisma/client";
import { clockMinutesBetween, isPausedStatus } from "@/lib/pause";
import { clockFor, loadBusinessCalendar } from "@/lib/slaConfig";
import { countWorkingDaysInclusive, loadSchedulingCalendar, toDateOnly } from "@/lib/scheduling";
import { dateStrToUTC } from "@/lib/serverDates";
import { nextWorkDay, workDaysAfter } from "@/lib/workdays";

type Db = PrismaClient | Prisma.TransactionClient;

/** A task and every subtask under it, at any depth (deleted ones left out). */
export async function withDescendants(db: Db, ids: string[]): Promise<string[]> {
  const all = new Set(ids);
  let frontier = ids;
  while (frontier.length > 0) {
    const children = await db.task.findMany({ where: { parentId: { in: frontier }, deletedAt: null }, select: { id: true } });
    frontier = children.map((c) => c.id).filter((id) => !all.has(id));
    frontier.forEach((id) => all.add(id));
  }
  return [...all];
}

/**
 * Fields to write when a task comes back from hold. Like the end of a wait on
 * the customer (see pauseUpdate), the time on hold is added to the paused
 * totals and, in an SLA project, the Due Date moves on by the working days
 * held:
 *   pausedMinutes += SLA-clock minutes from onHoldAt to now
 *   pausedDays    += working days from onHoldAt to now
 *   Due           =  Due + pausedDays added (working days)
 * Skipped when the task was already in Waiting / Customer Test (that wait is
 * counted by pausedAt already) or is Done.
 */
export async function releaseFields(db: Db, task: {
  status: string; projectId: string | null; onHoldAt: Date | null; pausedMinutes: number; pausedDays: number;
  startDate: Date | null; dueDate: Date | null; durationDays: number | null;
}, now = new Date()): Promise<Prisma.TaskUpdateInput> {
  const out: Prisma.TaskUpdateInput = { onHoldAt: null };
  if (!task.onHoldAt || task.status === "DONE" || isPausedStatus(task.status)) return out;

  const project = task.projectId
    ? await db.project.findUnique({ where: { id: task.projectId }, select: { slaTrackingEnabled: true, slaBusinessHours: true } })
    : null;
  const [calendar, sched] = await Promise.all([loadBusinessCalendar(), loadSchedulingCalendar()]);
  const workDays = { days: sched.workWeek.days, holidays: sched.holidayDateSet };
  const minutes = Math.round(clockMinutesBetween(task.onHoldAt, now, clockFor(!!project?.slaBusinessHours, calendar)));
  const days = workDaysAfter(toDateOnly(task.onHoldAt), toDateOnly(now), workDays);
  out.pausedMinutes = task.pausedMinutes + minutes;
  out.pausedDays = task.pausedDays + days;

  if (project?.slaTrackingEnabled && task.dueDate && days > 0) {
    let due = toDateOnly(task.dueDate);
    for (let i = 0; i < days; i++) due = nextWorkDay(due, workDays);
    out.dueDate = dateStrToUTC(due);
    out.dueSoonNotifiedAt = null;
    if (task.startDate && task.durationDays) out.durationDays = countWorkingDaysInclusive(toDateOnly(task.startDate), due, sched);
  }
  return out;
}
