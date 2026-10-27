import { prisma } from "@/lib/prisma";
import { clockMinutesBetween, isPausedStatus } from "@/lib/pause";
import { clockFor, loadBusinessCalendar } from "@/lib/slaConfig";
import { countWorkingDaysInclusive, loadSchedulingCalendar, toDateOnly } from "@/lib/scheduling";
import { dateStrToUTC } from "@/lib/serverDates";
import { nextWorkDay, workDaysAfter } from "@/lib/workdays";

interface PauseSource {
  status: string;
  projectId: string | null;
  pausedAt: Date | null;
  pausedMinutes: number;
  pausedDays: number;
  startDate: Date | null;
  dueDate: Date | null;
  durationDays: number | null;
}

export interface PauseFields {
  pausedAt?: Date | null;
  pausedMinutes?: number;
  pausedDays?: number;
  dueDate?: Date | null;
  durationDays?: number;
  dueSoonNotifiedAt?: null;
}

/**
 * Fields to write when a task's status changes, for waiting on the customer
 * (see src/lib/pause.ts). Entering a wait stamps pausedAt; leaving one adds it
 * to the totals and, in an SLA project, pushes the Due Date back by the
 * working days waited — not when it goes straight to Done, nor when the user
 * set the Due Date in the same save (`keepDue`).
 */
export async function pauseUpdate(task: PauseSource, nextStatus: string, keepDue = false, now = new Date()): Promise<PauseFields> {
  const was = isPausedStatus(task.status);
  const will = isPausedStatus(nextStatus);
  if (was === will) return {};
  if (will) return { pausedAt: now };
  if (!task.pausedAt) return { pausedAt: null };

  const project = task.projectId
    ? await prisma.project.findUnique({ where: { id: task.projectId }, select: { slaTrackingEnabled: true, slaBusinessHours: true } })
    : null;
  const [calendar, sched] = await Promise.all([loadBusinessCalendar(), loadSchedulingCalendar()]);
  const workDays = { days: sched.workWeek.days, holidays: sched.holidayDateSet };
  const minutes = Math.round(clockMinutesBetween(task.pausedAt, now, clockFor(!!project?.slaBusinessHours, calendar)));
  const days = workDaysAfter(toDateOnly(task.pausedAt), toDateOnly(now), workDays);
  const out: PauseFields = { pausedAt: null, pausedMinutes: task.pausedMinutes + minutes, pausedDays: task.pausedDays + days };

  if (project?.slaTrackingEnabled && task.dueDate && days > 0 && nextStatus !== "DONE" && !keepDue) {
    let due = toDateOnly(task.dueDate);
    for (let i = 0; i < days; i++) due = nextWorkDay(due, workDays);
    out.dueDate = dateStrToUTC(due);
    out.dueSoonNotifiedAt = null;
    if (task.startDate && task.durationDays) out.durationDays = countWorkingDaysInclusive(toDateOnly(task.startDate), due, sched);
  }
  return out;
}
