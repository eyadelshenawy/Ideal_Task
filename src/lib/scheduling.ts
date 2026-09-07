// Working-day scheduling helpers — the single source of truth for how the
// app moves dates around Duration, weekends, and holidays. Every place that
// needs to translate between (start, duration) and (start, due), or to warn
// about a non-working day, or to shift dates during a clone, calls through
// here. Adding a new working-day rule (half-days, region-specific closures)
// means editing this file, not chasing scattered calls.
//
// Dates are all "date-only" strings ("YYYY-MM-DD") at the boundary — the
// UTC-anchored Date the DB stores has time = 00:00Z, so slicing the ISO
// string gives back the same YYYY-MM-DD you put in. Internally we work
// with plain Date objects at UTC midnight to avoid every DST/timezone hazard.
//
// Two inputs feed every calculation: the org-wide WorkWeekConfig row
// (which weekdays count as work) and the Holiday table (specific dates
// that are non-working regardless of weekday). Both are loaded once per
// request via loadSchedulingCalendar(), then passed to the pure helpers
// below.

import { prisma } from "@/lib/prisma";

export interface WorkWeek {
  // Sunday..Saturday, true means "counts as a working day".
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}

export interface SchedulingCalendar {
  workWeek: WorkWeek;
  holidayDateSet: Set<string>; // "YYYY-MM-DD" for O(1) lookup
  holidayNameByDate: Map<string, string>;
}

// Egyptian/Gulf default (Sun-Thu on, Fri+Sat off). Used only if the
// singleton row hasn't been created yet — first read of the settings page
// creates it lazily.
const DEFAULT_WORK_WEEK: WorkWeek = {
  days: [true, true, true, true, true, false, false],
};

export async function loadSchedulingCalendar(): Promise<SchedulingCalendar> {
  const [config, holidays] = await Promise.all([
    prisma.workWeekConfig.findUnique({ where: { id: "singleton" } }),
    prisma.holiday.findMany({ select: { date: true, name: true } }),
  ]);
  const workWeek: WorkWeek = config
    ? { days: [config.sun, config.mon, config.tue, config.wed, config.thu, config.fri, config.sat] }
    : DEFAULT_WORK_WEEK;
  const holidayDateSet = new Set<string>();
  const holidayNameByDate = new Map<string, string>();
  for (const h of holidays) {
    const key = toDateOnly(h.date);
    holidayDateSet.add(key);
    holidayNameByDate.set(key, h.name);
  }
  return { workWeek, holidayDateSet, holidayNameByDate };
}

export function toDateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

// UTC weekday: 0 = Sunday .. 6 = Saturday.
function utcDayOfWeek(d: Date): number {
  return d.getUTCDay();
}

export function isWorkingDay(dateStr: string, cal: SchedulingCalendar): boolean {
  if (cal.holidayDateSet.has(dateStr)) return false;
  const dow = utcDayOfWeek(parseDateOnly(dateStr));
  return cal.workWeek.days[dow];
}

// Human label for the reason a date isn't a working day — used by warnings
// (e.g. "Due on 2026-06-15 (Eid al-Adha)" or "Start on Friday").
export function nonWorkingReason(dateStr: string, cal: SchedulingCalendar): string | null {
  if (cal.holidayDateSet.has(dateStr)) {
    return cal.holidayNameByDate.get(dateStr) ?? "Holiday";
  }
  const dow = utcDayOfWeek(parseDateOnly(dateStr));
  if (!cal.workWeek.days[dow]) {
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return names[dow];
  }
  return null;
}

// Count working days between start and end (both inclusive). Order-safe:
// end before start returns 0. Includes start day if it's a working day,
// includes end day if it's a working day. A one-working-day task has
// duration = 1 (start == end, same working day).
export function countWorkingDaysInclusive(startStr: string, endStr: string, cal: SchedulingCalendar): number {
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    if (isWorkingDay(toDateOnly(cursor), cal)) count++;
  }
  return count;
}

// Add `duration` working days starting from `startStr` (inclusive), returning
// the calendar date of the LAST working day (i.e. the due date). Duration=1
// means "the task is one working day long" and returns startStr itself, IF
// startStr is a working day — if not, it steps forward to the next working
// day and counts from there. Duration <= 0 returns startStr unchanged.
export function addWorkingDays(startStr: string, duration: number, cal: SchedulingCalendar): string {
  if (duration <= 0) return startStr;
  let cursor = parseDateOnly(startStr);
  // Nudge forward to the first working day so a non-working start still
  // yields a sensible due — the warning UI, not this helper, is where the
  // "you picked a non-working start" callout happens.
  while (!isWorkingDay(toDateOnly(cursor), cal)) cursor = addDays(cursor, 1);
  let remaining = duration - 1;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isWorkingDay(toDateOnly(cursor), cal)) remaining--;
  }
  return toDateOnly(cursor);
}

export interface ResolvedDates {
  startDate: string | null;
  dueDate: string | null;
  durationDays: number | null;
}

// Reconcile three related fields — Start, Due, Duration — after a PATCH
// that may have touched any of them. The caller passes what the request
// (or the pre-existing row) has for each; the return is the coherent
// triple the DB should store. Rules:
//
//   - No start given          -> nothing to compute, all three unchanged
//     (only start being null returns as-is; a Duration alone is meaningless
//     without an anchor)
//   - start + duration        -> due = start + (duration-1) working days
//   - start + due             -> duration = working days between them
//   - start + due + duration  -> due wins, duration recomputed from due
//     (a user who edited Due manually meant to move the endpoint; a
//     duration value coming along in the same payload is stale)
//
// Non-working start/due days are not blocked here — they're allowed with a
// warning surfaced client-side. This helper's job is math, not policy.
export function resolveTaskDates(
  input: { startDate: string | null; dueDate: string | null; durationDays: number | null },
  cal: SchedulingCalendar,
  dueWasExplicitlySet: boolean,
): ResolvedDates {
  const { startDate, dueDate, durationDays } = input;
  if (!startDate) {
    return { startDate: null, dueDate: dueDate, durationDays: null };
  }
  if (dueDate && (dueWasExplicitlySet || !durationDays)) {
    const d = Math.max(1, countWorkingDaysInclusive(startDate, dueDate, cal));
    return { startDate, dueDate, durationDays: d };
  }
  if (durationDays && durationDays > 0) {
    const computedDue = addWorkingDays(startDate, durationDays, cal);
    return { startDate, dueDate: computedDue, durationDays };
  }
  return { startDate, dueDate: dueDate, durationDays: null };
}
