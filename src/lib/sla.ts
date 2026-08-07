import type { Priority } from "@/types/models";

export interface SlaTarget {
  responseHours: number;
  resolutionDays: number;
}

export type SlaTargets = Record<Priority, SlaTarget>;

// Fallback used until a Super Admin sets their own values (or if the config
// row is somehow missing) — reasonable starting points for a support/
// implementation shop.
export const DEFAULT_SLA_TARGETS: SlaTargets = {
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
  now: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS
): SlaState {
  const deadline = new Date(new Date(createdAt).getTime() + targets[priority].responseHours * 3600000);
  if (firstCommentAt) return new Date(firstCommentAt) <= deadline ? "met" : "breached";
  return now <= deadline ? "pending" : "breached";
}

export function resolutionSlaState(
  priority: Priority,
  createdAt: string,
  completedAt: string | null,
  now: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS
): SlaState {
  const deadline = new Date(new Date(createdAt).getTime() + targets[priority].resolutionDays * 86400000);
  if (completedAt) return new Date(completedAt) <= deadline ? "met" : "breached";
  return now <= deadline ? "pending" : "breached";
}
