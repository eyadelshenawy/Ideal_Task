import type { Prisma } from "@prisma/client";

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
