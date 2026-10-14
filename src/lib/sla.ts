import type { Priority } from "@/types/models";
import { addBusinessMinutes, workdayMinutes, type BusinessCalendar } from "@/lib/businessTime";

export interface SlaTarget {
  responseHours: number;
  resolutionDays: number;
}

export type SlaTargets = Record<Priority, SlaTarget>;

// Fallback used until a Super Admin sets their own values (or if the config
// row is somehow missing) — reasonable starting points for a support/
// implementation shop.
export const DEFAULT_SLA_TARGETS: SlaTargets = {
  CRITICAL: { responseHours: 4, resolutionDays: 2 },
  HIGH: { responseHours: 24, resolutionDays: 4 },
  MEDIUM: { responseHours: 48, resolutionDays: 7 },
  LOW: { responseHours: 72, resolutionDays: 10 },
};

export type SlaState = "met" | "breached" | "pending";

/**
 * How the clock runs for a project. Without a business calendar (the
 * default) it's 24/7: response = hours after creation, resolution = days × 24h.
 * With one, only working time counts and a "day" is one full working day.
 */
export type SlaClock = { calendar: BusinessCalendar | null };

export const CALENDAR_CLOCK: SlaClock = { calendar: null };

export function responseDeadline(priority: Priority, createdAt: string | Date, targets: SlaTargets, clock: SlaClock = CALENDAR_CLOCK): Date {
  const start = new Date(createdAt);
  const minutes = targets[priority].responseHours * 60;
  return clock.calendar ? addBusinessMinutes(start, minutes, clock.calendar) : new Date(start.getTime() + minutes * 60000);
}

export function resolutionDeadline(priority: Priority, createdAt: string | Date, targets: SlaTargets, clock: SlaClock = CALENDAR_CLOCK): Date {
  const start = new Date(createdAt);
  const days = targets[priority].resolutionDays;
  return clock.calendar
    ? addBusinessMinutes(start, days * workdayMinutes(clock.calendar), clock.calendar)
    : new Date(start.getTime() + days * 86400000);
}

function stateFor(deadline: Date, doneAt: string | null, now: Date): SlaState {
  if (doneAt) return new Date(doneAt) <= deadline ? "met" : "breached";
  return now <= deadline ? "pending" : "breached";
}

/** "Responded" means the first real comment (not an automatic activity line) after creation. */
export function responseSlaState(
  priority: Priority,
  createdAt: string,
  firstCommentAt: string | null,
  now: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS,
  clock: SlaClock = CALENDAR_CLOCK,
): SlaState {
  return stateFor(responseDeadline(priority, createdAt, targets, clock), firstCommentAt, now);
}

export function resolutionSlaState(
  priority: Priority,
  createdAt: string,
  completedAt: string | null,
  now: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS,
  clock: SlaClock = CALENDAR_CLOCK,
): SlaState {
  return stateFor(resolutionDeadline(priority, createdAt, targets, clock), completedAt, now);
}
