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

// Full task shape — shared fields for both create (strict, below) and
// full-edit (as a lenient .partial(), so editing an older task that predates
// a mandatory-field rule doesn't get blocked).
const taskFields = z.object({
  code: z.string().trim().default(""),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  module: z.string().trim().default(""),
  projectId: z.string().nullable().default(null),
  assignees: assigneesSchema.default([]),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  status: z.enum(["TODO", "INPROGRESS", "INTERNAL_TEST", "CUSTOMER_TEST", "DONE"]).default("TODO"),
  startDate: dateOnly.default(null),
  dueDate: dateOnly.default(null),
  progress: z.number().min(0).max(100).default(0),
  isMilestone: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
  parentId: z.string().nullable().default(null),
  recurrenceFreq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullable().default(null),
  recurrenceEndDate: dateOnly.default(null),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
});

// Creating a task requires: Code, Title, Project, at least one Assignee, and
// dates — Due Date always, Start Date too unless it's a Milestone (a
// milestone is a single-date marker, no range).
export const taskCreateSchema = taskFields
  .extend({
    code: z.string().trim().min(1, "Code is required"),
    projectId: z.string().min(1, "Project is required"),
    assignees: assigneesSchema.min(1, "At least one assignee is required"),
  })
  .superRefine((data, ctx) => {
    if (!data.dueDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: data.isMilestone ? "Date is required" : "Due date is required", path: ["dueDate"] });
    }
    if (!data.isMilestone && !data.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start date is required", path: ["startDate"] });
    }
    // "YYYY-MM-DD" strings sort correctly with a plain comparison.
    if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start date can't be after Due date", path: ["startDate"] });
    }
    if (data.recurrenceEndDate && data.dueDate && data.recurrenceEndDate < data.dueDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Repeat end date can't be before Due date", path: ["recurrenceEndDate"] });
    }
  });

export const taskFullUpdateSchema = taskFields.partial();

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

// Bulk edit — applied identically to every task id in the request. Only
// fields relevant to a batch change; each is optional so callers can send
// just the one thing they're changing (e.g. status only).
export const taskBulkUpdateSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
  status: z.enum(["TODO", "INPROGRESS", "INTERNAL_TEST", "CUSTOMER_TEST", "DONE"]).optional(),
  assignees: assigneesSchema.optional(),
  projectId: z.string().nullable().optional(),
});

export const taskBulkDeleteSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
});

// Members (and anyone without project admin rights on a task) may only move
// its status and adjust its progress.
export const taskStatusUpdateSchema = z
  .object({
    status: z.enum(["TODO", "INPROGRESS", "INTERNAL_TEST", "CUSTOMER_TEST", "DONE"]).optional(),
    progress: z.number().min(0).max(100).optional(),
  })
  .refine((data) => data.status !== undefined || data.progress !== undefined, {
    message: "status or progress is required",
  });
