// Waiting on the customer: while a ticket is in one of these statuses the
// resolution SLA clock stops and it can't go overdue. Pure (no Prisma) so the
// browser and the server share one rule.
//
//   wait (minutes)    = time left the status − time entered it, on the project's SLA clock
//   SLA deadline      = original deadline + all waits
//   new Due Date      = Due Date + working days spent waiting (SLA projects only)
import { businessMinutesBetween } from "@/lib/businessTime";
import type { SlaClock } from "@/lib/sla";

export const PAUSED_STATUSES = ["WAITING_CUSTOMER", "CUSTOMER_TEST"] as const;

export function isPausedStatus(status: string): boolean {
  return (PAUSED_STATUSES as readonly string[]).includes(status);
}

/** Minutes between two instants on an SLA clock (working minutes for a business-hours project). */
export function clockMinutesBetween(from: Date, to: Date, clock: SlaClock): number {
  return clock.calendar ? businessMinutesBetween(from, to, clock.calendar) : Math.max(0, (to.getTime() - from.getTime()) / 60000);
}

export interface PauseState {
  status: string;
  pausedAt: string | Date | null;
  pausedMinutes: number;
}

/** Finished waits plus the one running now, in SLA-clock minutes. */
export function totalPausedMinutes(task: PauseState, now: Date, clock: SlaClock): number {
  const running = isPausedStatus(task.status) && task.pausedAt ? clockMinutesBetween(new Date(task.pausedAt), now, clock) : 0;
  return task.pausedMinutes + running;
}
