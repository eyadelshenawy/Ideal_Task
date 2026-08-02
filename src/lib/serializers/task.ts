import type { Task as PrismaTask } from "@prisma/client";
import { utcToDateStr } from "@/lib/serverDates";
import type { Task } from "@/types/models";

type TaskWithRelations = PrismaTask & {
  dependsOn: { id: string }[];
  assignees: { id: string }[];
  contactAssignees: { id: string }[];
  tags: { name: string }[];
  checklistItems: { done: boolean }[];
  _count: { attachments: number; events: number };
};

/** Shared Prisma `include` for any query whose result will pass through serializeTask. */
export const taskInclude = {
  dependsOn: { select: { id: true } },
  assignees: { select: { id: true } },
  contactAssignees: { select: { id: true } },
  tags: { select: { name: true } },
  checklistItems: { select: { done: true } },
  // Quick-glance counts shown directly on Board/List cards (no need to open
  // the task to see it has attachments/comments/a checklist in progress).
  _count: { select: { attachments: true, events: { where: { type: "COMMENT" } } } },
} as const;

export function serializeTask(t: TaskWithRelations): Task {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    module: t.module,
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
    parentId: t.parentId,
    childCodeSeq: t.childCodeSeq,
    attachmentCount: t._count.attachments,
    commentCount: t._count.events,
    checklistTotal: t.checklistItems.length,
    checklistDone: t.checklistItems.filter((c) => c.done).length,
  };
}
