import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Same rule everywhere a task list is scoped by role: Super Admins see
 * everything; everyone else sees tasks in a project they administer, plus
 * any task they're personally assigned to even outside those projects.
 *
 * Private personal tasks are never included here, for anyone, Super Admin
 * included — they only ever surface through the separate /api/tasks/personal
 * endpoint, scoped strictly to their own owner. See canViewTask below for the
 * single-task equivalent, which is where a private task's actual owner-only
 * access is granted.
 */
export function visibleTasksWhere(
  userId: string,
  isSuperAdmin: boolean,
  administeredProjectIds: string[]
): Prisma.TaskWhereInput {
  if (isSuperAdmin) return { deletedAt: null, isPrivate: false };
  return {
    deletedAt: null,
    isPrivate: false,
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
 *
 * A private task is a hard special case: only its own creator can ever view
 * it here — this check is NOT relaxed for Super Admin, unlike every other
 * rule in this file.
 */
export async function canViewTask(
  taskId: string,
  userId: string,
  isSuperAdmin: boolean,
  administeredProjectIds: string[]
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { deletedAt: true, isPrivate: true, createdById: true },
  });
  if (!task || task.deletedAt) return false;
  if (task.isPrivate) return task.createdById === userId;

  const found = await prisma.task.findFirst({
    where: { id: taskId, ...visibleTasksWhere(userId, isSuperAdmin, administeredProjectIds) },
    select: { id: true },
  });
  return !!found;
}
