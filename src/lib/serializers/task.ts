import type { Task as PrismaTask } from "@prisma/client";
import { utcToDateStr } from "@/lib/serverDates";
import type { Task } from "@/types/models";

type TaskWithRelations = PrismaTask & {
  dependsOn: { id: string }[];
  assignees: { id: string }[];
  contactAssignees: { id: string }[];
  tags: { name: string }[];
};

/** Shared Prisma `include` for any query whose result will pass through serializeTask. */
export const taskInclude = {
  dependsOn: { select: { id: true } },
  assignees: { select: { id: true } },
  contactAssignees: { select: { id: true } },
  tags: { select: { name: true } },
} as const;

export function serializeTask(t: TaskWithRelations): Task {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    assigneeIds: t.assignees.map((a) => a.id),
    contactAssigneeIds: t.contactAssignees.map((c) => c.id),
    priority: t.priority,
    status: t.status,
    startDate: utcToDateStr(t.startDate),
    dueDate: utcToDateStr(t.dueDate),
    progress: t.progress,
    isMilestone: t.isMilestone,
    dependsOn: t.dependsOn.map((d) => d.id),
    recurrenceFreq: t.recurrenceFreq,
    recurrenceEndDate: utcToDateStr(t.recurrenceEndDate),
    tags: t.tags.map((tag) => tag.name),
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
