import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

// Full task shape — used for admin create and admin full-edit (as a .partial()).
export const taskCreateSchema = z.object({
  code: z.string().trim().default(""),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  projectId: z.string().nullable().default(null),
  assigneeId: z.string().nullable().default(null),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  status: z.enum(["TODO", "INPROGRESS", "REVIEW", "DONE"]).default("TODO"),
  startDate: dateOnly.default(null),
  dueDate: dateOnly.default(null),
  progress: z.number().min(0).max(100).default(0),
  isMilestone: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
});

export const taskFullUpdateSchema = taskCreateSchema.partial();

// Members may only move a task's status and adjust its progress.
export const taskStatusUpdateSchema = z
  .object({
    status: z.enum(["TODO", "INPROGRESS", "REVIEW", "DONE"]).optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .refine((data) => data.status !== undefined || data.progress !== undefined, {
    message: "status or progress is required",
  });
