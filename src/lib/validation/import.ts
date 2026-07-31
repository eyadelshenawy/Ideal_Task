import { z } from "zod";

export const importRawRowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(2000),
});

export const previewTaskSchema = z.object({
  tempId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  module: z.string(),
  tags: z.array(z.string()),
  comment: z.string(),
  projectId: z.string().nullable(),
  newProjectName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  status: z.enum(["TODO", "INPROGRESS", "INTERNAL_TEST", "CUSTOMER_TEST", "DONE"]),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  progress: z.number().min(0).max(100),
  isMilestone: z.boolean(),
  dependsOnTempIds: z.array(z.string()),
  dependsOnExistingIds: z.array(z.string()),
});

export const importCommitSchema = z.object({
  tasksToAdd: z.array(previewTaskSchema).max(2000),
  newProjectNames: z.array(z.string()),
});
