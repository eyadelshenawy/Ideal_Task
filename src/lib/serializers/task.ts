import type { Task as PrismaTask } from "@prisma/client";
import { utcToDateStr } from "@/lib/serverDates";
import type { Task } from "@/types/models";

type TaskWithDependsOn = PrismaTask & { dependsOn: { id: string }[] };

export function serializeTask(t: TaskWithDependsOn): Task {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description,
    projectId: t.projectId,
    assigneeId: t.assigneeId,
    contactAssigneeId: t.contactAssigneeId,
    priority: t.priority,
    status: t.status,
    startDate: utcToDateStr(t.startDate),
    dueDate: utcToDateStr(t.dueDate),
    progress: t.progress,
    isMilestone: t.isMilestone,
    dependsOn: t.dependsOn.map((d) => d.id),
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
