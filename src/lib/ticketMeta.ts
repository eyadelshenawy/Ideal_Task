import type { MatrixLevel, Priority, TicketType, TicketTypeOption } from "@/types/models";

export interface TicketTypeMeta {
  value: TicketType;
  label: string;
  short: string;
  color: string;
  bg: string;
  active: boolean;
  system: boolean;
}

// Defaults until the configured list loads (see applyListConfig in
// src/lib/listConfig.ts, which replaces this array's contents in place).
export const TICKET_TYPES: TicketTypeMeta[] = [
  { value: "TASK", label: "Task", short: "Task", color: "#5B6B66", bg: "#EEF1F0", active: true, system: true },
  { value: "INCIDENT", label: "Incident", short: "INC", color: "#9A3530", bg: "#FBE7E5", active: true, system: true },
  { value: "SERVICE_REQUEST", label: "Service Request", short: "SR", color: "#0A5A46", bg: "#E4F0EA", active: true, system: true },
  { value: "CHANGE_REQUEST", label: "Change Request", short: "CHG", color: "#8A5A00", bg: "#FFF3D6", active: true, system: false },
  { value: "PROBLEM", label: "Problem", short: "PRB", color: "#5A3E8A", bg: "#EEE7F8", active: true, system: false },
];

export function toTypeMeta(o: TicketTypeOption): TicketTypeMeta {
  return { value: o.code, label: o.label, short: o.short, color: o.color, bg: o.bg, active: o.active, system: o.system };
}

export function ticketTypeMeta(type: TicketType): TicketTypeMeta {
  return TICKET_TYPES.find((t) => t.value === type)
    ?? { value: type, label: type, short: type, color: "#5B6B66", bg: "#EEF1F0", active: false, system: false };
}

export const MATRIX_LEVELS: { value: MatrixLevel; label: string }[] = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

// Plain-language wording for the customer intake form.
export const IMPACT_HINTS: Record<MatrixLevel, string> = {
  HIGH: "The whole company or a critical process is affected",
  MEDIUM: "A department or team is affected",
  LOW: "One person is affected",
};

export const URGENCY_HINTS: Record<MatrixLevel, string> = {
  HIGH: "Work has stopped — needed now",
  MEDIUM: "Needed today",
  LOW: "Can wait a few days",
};

// Impact (rows) × Urgency (columns) → Priority.
const MATRIX: Record<MatrixLevel, Record<MatrixLevel, Priority>> = {
  HIGH: { HIGH: "CRITICAL", MEDIUM: "HIGH", LOW: "MEDIUM" },
  MEDIUM: { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" },
  LOW: { HIGH: "MEDIUM", MEDIUM: "LOW", LOW: "LOW" },
};

export function priorityFromMatrix(impact: MatrixLevel | null, urgency: MatrixLevel | null): Priority | null {
  if (!impact || !urgency) return null;
  return MATRIX[impact][urgency];
}
