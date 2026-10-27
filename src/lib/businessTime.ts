// Working-hours arithmetic for the SLA clock. Pure (no DB access) so the
// browser and the server compute identical deadlines.

export interface BusinessCalendar {
  // Sunday..Saturday, true = working day.
  workDays: boolean[];
  // "YYYY-MM-DD" dates that are non-working regardless of weekday.
  holidays: string[];
  // Minutes from local midnight.
  startMinutes: number;
  endMinutes: number;
  timeZone: string;
}

interface LocalParts {
  dateStr: string;
  minuteOfDay: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

function localFields(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year), m: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour), min: Number(parts.minute), s: Number(parts.second),
  };
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const f = localFields(instant, timeZone);
  const dateStr = `${f.y}-${String(f.m).padStart(2, "0")}-${String(f.d).padStart(2, "0")}`;
  return { dateStr, minuteOfDay: f.h * 60 + f.min + f.s / 60 };
}

// Offset of timeZone from UTC at `instant`, in ms (positive east of UTC).
function tzOffsetMs(instant: Date, timeZone: string): number {
  const f = localFields(instant, timeZone);
  const asUtc = Date.UTC(f.y, f.m - 1, f.d, f.h, f.min, f.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// The UTC instant for a wall-clock time in timeZone. Two passes settle the
// offset across a DST change.
function localToUtc(dateStr: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  let guess = naive - tzOffsetMs(new Date(naive), timeZone);
  guess = naive - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

function nextDateStr(dateStr: string): string {
  const t = new Date(`${dateStr}T00:00:00.000Z`).getTime() + 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function isWorkingDate(dateStr: string, cal: BusinessCalendar): boolean {
  if (cal.holidays.includes(dateStr)) return false;
  return !!cal.workDays[new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()];
}

export function workdayMinutes(cal: BusinessCalendar): number {
  return Math.max(0, cal.endMinutes - cal.startMinutes);
}

/** The instant `minutes` of working time after `start`. */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessCalendar): Date {
  const perDay = workdayMinutes(cal);
  // A calendar with no working time can never be satisfied; fall back to a 24/7 clock.
  if (perDay <= 0 || !cal.workDays.some(Boolean)) return new Date(start.getTime() + minutes * 60000);

  let remaining = minutes;
  let { dateStr, minuteOfDay } = localParts(start, cal.timeZone);
  let cursor = start;

  // Bounded so a misconfigured calendar (e.g. every day a holiday) can't spin forever.
  for (let i = 0; i < 3700; i++) {
    if (!isWorkingDate(dateStr, cal) || minuteOfDay >= cal.endMinutes) {
      dateStr = nextDateStr(dateStr);
      minuteOfDay = cal.startMinutes;
      cursor = localToUtc(dateStr, minuteOfDay, cal.timeZone);
      continue;
    }
    if (minuteOfDay < cal.startMinutes) {
      minuteOfDay = cal.startMinutes;
      cursor = localToUtc(dateStr, minuteOfDay, cal.timeZone);
    }
    const available = cal.endMinutes - minuteOfDay;
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60000);
    remaining -= available;
    dateStr = nextDateStr(dateStr);
    minuteOfDay = cal.startMinutes;
    cursor = localToUtc(dateStr, minuteOfDay, cal.timeZone);
  }
  return new Date(start.getTime() + minutes * 60000);
}

/** Working minutes between two instants (0 when `to` ≤ `from`). */
export function businessMinutesBetween(from: Date, to: Date, cal: BusinessCalendar): number {
  if (to.getTime() <= from.getTime()) return 0;
  if (workdayMinutes(cal) <= 0 || !cal.workDays.some(Boolean)) return (to.getTime() - from.getTime()) / 60000;

  const end = localParts(to, cal.timeZone);
  let { dateStr, minuteOfDay } = localParts(from, cal.timeZone);
  let total = 0;
  for (let i = 0; i < 3700; i++) {
    if (isWorkingDate(dateStr, cal)) {
      const s = Math.max(minuteOfDay, cal.startMinutes);
      const e = dateStr === end.dateStr ? Math.min(end.minuteOfDay, cal.endMinutes) : cal.endMinutes;
      if (e > s) total += e - s;
    }
    if (dateStr >= end.dateStr) break;
    dateStr = nextDateStr(dateStr);
    minuteOfDay = 0;
  }
  return total;
}
