import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Same rule everywhere a task list is scoped by role: Super Admins see
 * everything; everyone else sees tasks in a project they administer, plus
 * any task they're personally assigned to even outside those projects.
 */
export function visibleTasksWhere(
  userId: string,
  isSuperAdmin: boolean,
  administeredProjectIds: string[]
): Prisma.TaskWhereInput {
  if (isSuperAdmin) return { deletedAt: null };
  return {
    deletedAt: null,
    OR: [
      { assignees: { some: { id: userId } } },
      ...(administeredProjectIds.length > 0 ? [{ projectId: { in: administeredProjectIds } }] : []),
    ],
  };
}

/**
 * Same rule, for a single task by id — used by the per-task endpoints
 * (comments, checklist, attachments) so a plain Member can't read or write
 * to a task that isn't theirs just by knowing its id, even though the main
 * list already hides it from them.
 */
export async function canViewTask(
  taskId: string,
  userId: string,
  isSuperAdmin: boolean,
  administeredProjectIds: string[]
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...visibleTasksWhere(userId, isSuperAdmin, administeredProjectIds) },
    select: { id: true },
  });
  return !!task;
}
