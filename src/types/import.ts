import type { Priority, Status } from "./models";

export interface ImportPreviewTask {
  tempId: string;
  code: string;
  title: string;
  description: string;
  module: string;
  tags: string[];
  comment: string;
  projectId: string | null;
  newProjectName: string | null;
  assigneeId: string | null;
  priority: Priority;
  status: Status;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  isMilestone: boolean;
  dependsOnTempIds: string[];
  dependsOnExistingIds: string[];
}

export interface ImportPreview {
  tasksToAdd: ImportPreviewTask[];
  newProjectNames: string[];
  warnings: string[];
}
