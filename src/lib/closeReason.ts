import type { CloseReason } from "@prisma/client";

export const CLOSE_REASONS: { id: CloseReason; label: string }[] = [
  { id: "RESOLVED", label: "Resolved" },
  { id: "NOT_APPLICABLE", label: "Not applicable" },
  { id: "DUPLICATE", label: "Duplicate" },
  { id: "CANCELLED", label: "Cancelled" },
];

/**
 * The closeReason to write for a status change, or undefined to leave it:
 * - becoming Done: the reason picked, else Resolved;
 * - staying Done: a newly picked reason, else unchanged;
 * - leaving Done (or never Done): cleared.
 */
export function closeReasonUpdate(prevStatus: string, nextStatus: string, requested?: CloseReason | null): CloseReason | null | undefined {
  if (nextStatus !== "DONE") return prevStatus === "DONE" ? null : undefined;
  if (requested) return requested;
  return prevStatus === "DONE" ? undefined : "RESOLVED";
}

/** Only Resolved counts toward SLA met/breached and resolution times. */
export const countsAsResolved = (t: { status: string; closeReason?: string | null }) =>
  t.status !== "DONE" || !t.closeReason || t.closeReason === "RESOLVED";
