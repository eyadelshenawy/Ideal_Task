import type { PrismaClient } from "@prisma/client";

/**
 * True if setting `taskId`'s predecessors to include `candidateIds` would
 * create a dependency cycle — i.e. one of those candidates (directly or
 * transitively, through its own predecessors) already depends on `taskId`.
 */
export async function wouldCreateCycle(db: PrismaClient, taskId: string, candidateIds: string[]): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [...candidateIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const task = await db.task.findUnique({ where: { id: current }, select: { dependsOn: { select: { id: true } } } });
    if (task) queue.push(...task.dependsOn.map((d) => d.id));
  }
  return false;
}
