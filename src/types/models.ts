export type Role = "ADMIN" | "MEMBER";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type Status = "TODO" | "INPROGRESS" | "REVIEW" | "DONE";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  projectId: string | null;
  assigneeId: string | null;
  priority: Priority;
  status: Status;
  startDate: string | null; // "YYYY-MM-DD"
  dueDate: string | null; // "YYYY-MM-DD"
  progress: number;
  isMilestone: boolean;
  dependsOn: string[]; // predecessor task ids
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
