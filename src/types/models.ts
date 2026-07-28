export type Role = "SUPER_ADMIN" | "MEMBER";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type Status = "TODO" | "INPROGRESS" | "REVIEW" | "DONE";

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
  projectId: string | null;
  assigneeIds: string[];
  contactAssigneeIds: string[];
  priority: Priority;
  status: Status;
  startDate: string | null; // "YYYY-MM-DD"
  dueDate: string | null; // "YYYY-MM-DD"
  progress: number;
  isMilestone: boolean;
  dependsOn: string[]; // predecessor task ids
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrashedTask extends Task {
  deletedAt: string;
}
