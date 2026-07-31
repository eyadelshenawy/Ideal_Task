import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Advances the project's running task-code counter and returns a suggested
 * code like "APEX-0007". Callers (task create, Excel import) use this as the
 * default; a user can still edit the numeric suffix afterward, but the
 * project-code prefix itself is enforced (see codeMatchesProject).
 */
export async function nextTaskCode(db: Db, projectId: string): Promise<string> {
  const project = await db.project.update({
    where: { id: projectId },
    data: { taskCodeSeq: { increment: 1 } },
    select: { code: true, taskCodeSeq: true },
  });
  return `${project.code}-${String(project.taskCodeSeq).padStart(4, "0")}`;
}

/** A task's code must start with "<PROJECT_CODE>-", case-insensitively. */
export function codeMatchesProject(code: string, projectCode: string): boolean {
  return code.trim().toUpperCase().startsWith(`${projectCode.toUpperCase()}-`);
}
