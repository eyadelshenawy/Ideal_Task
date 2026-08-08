export type Role = "SUPER_ADMIN" | "MEMBER";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type Status = "TODO" | "READY" | "INPROGRESS" | "INTERNAL_TEST" | "CUSTOMER_TEST" | "DONE";
export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** Project ids this member holds a per-project admin grant on. */
  projectAdminOf: string[];
}

export interface Project {
  id: string;
  name: string;
  code: string;
  taskCodeSeq: number;
  /** Non-null means a public read-only status link is live at /share/[shareToken]. */
  shareToken: string | null;
  /** Non-null means a public ticket-submission form is live at /intake/[intakeToken]. */
  intakeToken: string | null;
  /** Off by default — only support/ticket-style projects should count toward SLA percentages. */
  slaTrackingEnabled: boolean;
}

export interface TrashedProject extends Project {
  deletedAt: string;
}

/** A task assignee without a system login — a client contact or other external person. */
export interface Contact {
  id: string;
  name: string;
}

/** Resolved display info for a task's assignee, whichever kind it is. */
export interface AssigneeDisplay {
  name: string;
  color?: string;
  active?: boolean;
  kind: "user" | "contact";
}

export interface Task {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  module: string | null;
  projectId: string | null;
  /** A private personal task — visible only to its own creator, everywhere. */
  isPrivate: boolean;
  assigneeIds: string[];
  contactAssigneeIds: string[];
  priority: Priority;
  status: Status;
  startDate: string | null; // "YYYY-MM-DD"
  dueDate: string | null; // "YYYY-MM-DD"
  completedAt: string | null; // "YYYY-MM-DD" — when it actually finished, auto-set on DONE
  progress: number;
  isMilestone: boolean;
  dependsOn: string[]; // predecessor task ids
  recurrenceFreq: RecurrenceFreq | null;
  recurrenceEndDate: string | null; // "YYYY-MM-DD"
  tags: string[];
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** Parent task id, for a hierarchical subtask (e.g. ABC-0001-01 under ABC-0001). */
  parentId: string | null;
  /** This task's own running counter for ITS children's codes — used to suggest the next child code. */
  childCodeSeq: number;
  /** Quick-glance counts shown on Board/List cards. */
  attachmentCount: number;
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
}

export interface TrashedTask extends Task {
  deletedAt: string;
}
