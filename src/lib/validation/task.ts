import { z } from "zod";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable();

// A single assignee entry — either a real system user or an external Contact
// (no login). A task can have any number of these, mixed.
export const assigneeEntrySchema = z.union([
  z.object({ type: z.literal("user"), id: z.string().min(1) }),
  z.object({ type: z.literal("contact"), id: z.string().min(1) }),
]);
export const assigneesSchema = z.array(assigneeEntrySchema);
type AssigneeEntry = z.infer<typeof assigneeEntrySchema>;

// Full task shape — used for admin/project-admin create and full-edit (as a .partial()).
export const taskCreateSchema = z.object({
  code: z.string().trim().default(""),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  projectId: z.string().nullable().default(null),
  assignees: assigneesSchema.default([]),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  status: z.enum(["TODO", "INPROGRESS", "REVIEW", "DONE"]).default("TODO"),
  startDate: dateOnly.default(null),
  dueDate: dateOnly.default(null),
  progress: z.number().min(0).max(100).default(0),
  isMilestone: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
});

export const taskFullUpdateSchema = taskCreateSchema.partial();

/** Prisma nested-write payload connecting a fresh task to its assignees (create only). */
export function assigneesToConnect(assignees: AssigneeEntry[]) {
  const userIds = assignees.filter((a) => a.type === "user").map((a) => a.id);
  const contactIds = assignees.filter((a) => a.type === "contact").map((a) => a.id);
  return {
    assignees: { connect: userIds.map((id) => ({ id })) },
    contactAssignees: { connect: contactIds.map((id) => ({ id })) },
  };
}

/** Prisma nested-write payload replacing a task's whole assignee list (update). */
export function assigneesToSet(assignees: AssigneeEntry[]) {
  const userIds = assignees.filter((a) => a.type === "user").map((a) => a.id);
  const contactIds = assignees.filter((a) => a.type === "contact").map((a) => a.id);
  return {
    assignees: { set: userIds.map((id) => ({ id })) },
    contactAssignees: { set: contactIds.map((id) => ({ id })) },
  };
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
