import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

// A task's assignee is either a real system user, an external Contact (no
// login), or nobody — at most one of Task.assigneeId / contactAssigneeId is
// ever set, this union is how the client tells the API which.
export const assigneeSchema = z.union([
  z.object({ type: z.literal("user"), id: z.string().min(1) }),
  z.object({ type: z.literal("contact"), id: z.string().min(1) }),
  z.object({ type: z.literal("none") }),
]);

// Full task shape — used for admin/project-admin create and full-edit (as a .partial()).
export const taskCreateSchema = z.object({
  code: z.string().trim().default(""),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  projectId: z.string().nullable().default(null),
  assignee: assigneeSchema.default({ type: "none" }),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  status: z.enum(["TODO", "INPROGRESS", "REVIEW", "DONE"]).default("TODO"),
  startDate: dateOnly.default(null),
  dueDate: dateOnly.default(null),
  progress: z.number().min(0).max(100).default(0),
  isMilestone: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
});

export const taskFullUpdateSchema = taskCreateSchema.partial();

type Assignee = z.infer<typeof assigneeSchema>;

/** Converts the client's assignee union into the two Prisma scalar fields. */
export function assigneeToFields(assignee: Assignee): { assigneeId: string | null; contactAssigneeId: string | null } {
  if (assignee.type === "user") return { assigneeId: assignee.id, contactAssigneeId: null };
  if (assignee.type === "contact") return { assigneeId: null, contactAssigneeId: assignee.id };
  return { assigneeId: null, contactAssigneeId: null };
}

// Members (and anyone without project admin rights on a task) may only move
// its status and adjust its progress.
export const taskStatusUpdateSchema = z
  .object({
    status: z.enum(["TODO", "INPROGRESS", "REVIEW", "DONE"]).optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .refine((data) => data.status !== undefined || data.progress !== undefined, {
    message: "status or progress is required",
  });
