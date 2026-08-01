import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** A child task's code must start with "<PARENT_CODE>-", case-insensitively. */
export function codeMatchesParent(code: string, parentCode: string): boolean {
  return code.trim().toUpperCase().startsWith(`${parentCode.toUpperCase()}-`);
}

/** All descendant task ids of `taskId`, at any depth (not including taskId itself). */
export async function getDescendantIds(db: Db, taskId: string): Promise<string[]> {
  const result: string[] = [];
  let frontier = [taskId];
  while (frontier.length > 0) {
    const children = await db.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const ids = children.map((c) => c.id);
    if (ids.length === 0) break;
    result.push(...ids);
    frontier = ids;
  }
  return result;
}

/**
 * True if setting `taskId`'s parent to `candidateParentId` would create a
 * cycle — i.e. `taskId` is already `candidateParentId` itself, or one of its
 * ancestors.
 */
export async function wouldCreateHierarchyCycle(db: Db, taskId: string, candidateParentId: string): Promise<boolean> {
  let current: string | null = candidateParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === taskId) return true;
    if (visited.has(current)) break; // defensive guard against a pre-existing bad loop
    visited.add(current);
    const parent: { parentId: string | null } | null = await db.task.findUnique({ where: { id: current }, select: { parentId: true } });
    current = parent?.parentId ?? null;
  }
  return false;
}

/**
 * Re-derives a single parent's status from its (non-deleted) children: DONE
 * if every child is DONE, reverted to INPROGRESS if it was DONE but a child
 * no longer is. Returns whether the parent's status actually changed.
 */
async function recomputeOneLevel(db: Db, parentId: string): Promise<boolean> {
  const [parent, siblings] = await Promise.all([
    db.task.findUnique({ where: { id: parentId }, select: { status: true } }),
    db.task.findMany({ where: { parentId, deletedAt: null }, select: { status: true } }),
  ]);
  if (!parent) return false;

  const allDone = siblings.length > 0 && siblings.every((s) => s.status === "DONE");
  if (allDone && parent.status !== "DONE") {
    await db.task.update({ where: { id: parentId }, data: { status: "DONE", progress: 100 } });
    return true;
  }
  if (!allDone && parent.status === "DONE") {
    // Reopening un-does the 100% this task got when it auto-completed —
    // otherwise the progress bar would keep reading "done" under a
    // now-incorrect "In Progress" status.
    const doneCount = siblings.filter((s) => s.status === "DONE").length;
    const progress = siblings.length > 0 ? Math.round((doneCount / siblings.length) * 100) : 0;
    await db.task.update({ where: { id: parentId }, data: { status: "INPROGRESS", progress } });
    return true;
  }
  return false;
}

/**
 * Climbs the parent chain starting at `startParentId`, syncing each level's
 * status from its children, and stops as soon as a level doesn't need to
 * change (a no-op there means nothing propagates further up either).
 */
export async function syncAncestorChain(db: Db, startParentId: string | null): Promise<void> {
  let currentId = startParentId;
  while (currentId) {
    const changed = await recomputeOneLevel(db, currentId);
    if (!changed) break;
    const parent: { parentId: string | null } | null = await db.task.findUnique({ where: { id: currentId }, select: { parentId: true } });
    currentId = parent?.parentId ?? null;
  }
}
