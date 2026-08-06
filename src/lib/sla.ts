import type { Priority } from "@/types/models";

export interface SlaTarget {
  responseHours: number;
  resolutionDays: number;
}

// Default targets, not (yet) configurable per project — reasonable starting
// points for a support/implementation shop; easy to tune later if these
// turn out wrong for how the team actually works.
export const SLA_TARGETS: Record<Priority, SlaTarget> = {
  HIGH: { responseHours: 4, resolutionDays: 2 },
  MEDIUM: { responseHours: 24, resolutionDays: 5 },
  LOW: { responseHours: 48, resolutionDays: 10 },
};

export type SlaState = "met" | "breached" | "pending";

/** "Responded" means the first real comment (not an automatic activity line) after creation. */
export function responseSlaState(
  priority: Priority,
  createdAt: string,
  firstCommentAt: string | null,
  now: Date
): SlaState {
  const deadline = new Date(new Date(createdAt).getTime() + SLA_TARGETS[priority].responseHours * 3600000);
  if (firstCommentAt) return new Date(firstCommentAt) <= deadline ? "met" : "breached";
  return now <= deadline ? "pending" : "breached";
}

export function resolutionSlaState(
  priority: Priority,
  createdAt: string,
  completedAt: string | null,
  now: Date
): SlaState {
  const deadline = new Date(new Date(createdAt).getTime() + SLA_TARGETS[priority].resolutionDays * 86400000);
  if (completedAt) return new Date(completedAt) <= deadline ? "met" : "breached";
  return now <= deadline ? "pending" : "breached";
}
