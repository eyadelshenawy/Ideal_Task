import type { MatrixLevel, Priority, TicketType } from "@/types/models";

export const TICKET_TYPES: { value: TicketType; label: string; short: string; color: string; bg: string }[] = [
  { value: "TASK", label: "Task", short: "Task", color: "#5B6B66", bg: "#EEF1F0" },
  { value: "INCIDENT", label: "Incident", short: "INC", color: "#9A3530", bg: "#FBE7E5" },
  { value: "SERVICE_REQUEST", label: "Service Request", short: "SR", color: "#0A5A46", bg: "#E4F0EA" },
  { value: "CHANGE_REQUEST", label: "Change Request", short: "CHG", color: "#8A5A00", bg: "#FFF3D6" },
  { value: "PROBLEM", label: "Problem", short: "PRB", color: "#5A3E8A", bg: "#EEE7F8" },
];

export function ticketTypeMeta(type: TicketType) {
  return TICKET_TYPES.find((t) => t.value === type) ?? TICKET_TYPES[0];
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
