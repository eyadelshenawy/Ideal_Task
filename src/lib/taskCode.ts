import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Advances the project's running task-code counter and returns a suggested
 * code like "APEX-0007". This is a suggestion, not an enforced unique key —
 * callers (task create, Excel import) use it as the default, but a user can
 * still edit a task's code afterward (e.g. to "APEX-FI-0007" for a
 * department-specific scheme).
 */
export async function nextTaskCode(db: Db, projectId: string): Promise<string> {
  const project = await db.project.update({
    where: { id: projectId },
    data: { taskCodeSeq: { increment: 1 } },
    select: { code: true, taskCodeSeq: true },
  });
  return `${project.code}-${String(project.taskCodeSeq).padStart(4, "0")}`;
}
