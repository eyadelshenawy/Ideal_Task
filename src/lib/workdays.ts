// Overdue and due-soon counts in working days — weekends and holidays from
// the Work Calendar don't count. Pure (no Prisma) so the browser and the
// server share one rule. Dates are "YYYY-MM-DD" strings.

export interface WorkDays {
  days: boolean[]; // Sunday..Saturday, true = working day
  holidays: Set<string>;
}

// Sun–Thu on, Fri + Sat off: the Work Calendar's own default.
export const DEFAULT_WORK_DAYS: WorkDays = {
  days: [true, true, true, true, true, false, false],
  holidays: new Set(),
};

function utc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY = 86400000;
const str = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isWorkDay(dateStr: string, cal: WorkDays): boolean {
  return !cal.holidays.has(dateStr) && !!cal.days[new Date(utc(dateStr)).getUTCDay()];
}

/** Working days after `from` up to and including `to` (0 when `to` ≤ `from`). */
export function workDaysAfter(from: string, to: string, cal: WorkDays): number {
  let count = 0;
  for (let t = utc(from) + DAY, end = utc(to); t <= end; t += DAY) {
    if (isWorkDay(str(t), cal)) count++;
  }
  return count;
}

/** The first working day after `dateStr` (or the day after, if none in a year). */
export function nextWorkDay(dateStr: string, cal: WorkDays): string {
  for (let i = 1; i <= 366; i++) {
    const d = str(utc(dateStr) + i * DAY);
    if (isWorkDay(d, cal)) return d;
  }
  return str(utc(dateStr) + DAY);
}

/** Days overdue = working days after the due date up to today. */
export function daysOverdue(task: { dueDate: string | null; status: string }, today: string, cal: WorkDays): number {
  if (!task.dueDate || task.status === "DONE" || task.dueDate >= today) return 0;
  return workDaysAfter(task.dueDate, today, cal);
}

/** Overdue = not Done and at least one working day past the due date. */
export function isOverdue(task: { dueDate: string | null; status: string }, today: string, cal: WorkDays): boolean {
  return daysOverdue(task, today, cal) > 0;
}
