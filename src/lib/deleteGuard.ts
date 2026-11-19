import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Work recorded on tasks: comments written by people (team or customer — the
 * automatic "status changed" lines don't count) and logged hours. A task with
 * any of this can't be moved to Trash, except by a Super Admin who confirms;
 * it should be closed as Done (e.g. Not applicable) instead.
 */
export async function recordedWork(db: Db, taskIds: string[]): Promise<{ comments: number; hours: number }> {
  const [comments, time] = await Promise.all([
    db.taskEvent.count({ where: { taskId: { in: taskIds }, type: "COMMENT" } }),
    db.timeEntry.aggregate({ where: { taskId: { in: taskIds } }, _sum: { hours: true } }),
  ]);
  return { comments, hours: Math.round((time._sum.hours ?? 0) * 100) / 100 };
}

export function recordedWorkMessage(w: { comments: number; hours: number }, label: string): string {
  const parts = [w.comments ? `${w.comments} comment${w.comments === 1 ? "" : "s"}` : "", w.hours ? `${w.hours} h logged` : ""].filter(Boolean);
  return `${label} has ${parts.join(" and ")}, so it can't be moved to Trash. Close it as Done instead (e.g. Not applicable).`;
}
