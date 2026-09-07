import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** A child task's code must start with "<PARENT_CODE>-", case-insensitively. */
export function codeMatchesParent(code: string, parentCode: string): boolean {
  return code.trim().toUpperCase().startsWith(`${parentCode.toUpperCase()}-`);
}

/**
 * Advances the parent's own child-code counter and returns a suggested
 * hierarchical code like "ABC-0001-01" — the same idea as taskCode.ts's
 * nextTaskCode, one level down. Returns null if the parent has no code of
 * its own yet (a subtask can't get a hierarchical code without one).
 */
export async function nextChildCode(db: Db, parentId: string): Promise<string | null> {
  const parent = await db.task.update({
    where: { id: parentId },
    data: { childCodeSeq: { increment: 1 } },
    select: { code: true, childCodeSeq: true },
  });
  if (!parent.code) return null;
  return `${parent.code}-${String(parent.childCodeSeq).padStart(2, "0")}`;
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
 * Re-derives a single parent's status AND date range from its (non-deleted)
 * children: status goes DONE when every child is DONE (reverts to INPROGRESS
 * otherwise), and startDate / dueDate / durationDays are rolled up from the
 * earliest child start to the latest child due, with duration recomputed as
 * working days across that span using the org calendar. Returns whether the
 * parent's stored row actually changed — the ancestor loop uses that to stop
 * when nothing propagates further up.
 *
 * Rollup is authoritative for any parent that has children: manually editing
 * a parent's dates works, but the next time a child moves the parent snaps
 * back to the computed span. This is intentional — the parent's dates aren't
 * a fact of their own, they're a summary of the children.
 */
async function recomputeOneLevel(db: Db, parentId: string): Promise<boolean> {
  const [parent, siblings] = await Promise.all([
    db.task.findUnique({
      where: { id: parentId },
      select: { status: true, startDate: true, dueDate: true, durationDays: true },
    }),
    db.task.findMany({
      where: { parentId, deletedAt: null },
      select: { status: true, startDate: true, dueDate: true },
    }),
  ]);
  if (!parent) return false;

  const patch: {
    status?: "DONE" | "INPROGRESS";
    progress?: number;
    startDate?: Date | null;
    dueDate?: Date | null;
    durationDays?: number | null;
  } = {};

  const allDone = siblings.length > 0 && siblings.every((s) => s.status === "DONE");
  if (allDone && parent.status !== "DONE") {
    patch.status = "DONE";
    patch.progress = 100;
  } else if (!allDone && parent.status === "DONE") {
    // Reopening un-does the 100% this task got when it auto-completed —
    // otherwise the progress bar would keep reading "done" under a
    // now-incorrect "In Progress" status.
    const doneCount = siblings.filter((s) => s.status === "DONE").length;
    patch.status = "INPROGRESS";
    patch.progress = siblings.length > 0 ? Math.round((doneCount / siblings.length) * 100) : 0;
  }

  // Date rollup: earliest start across children, latest due. Only compute
  // when there IS at least one child with a date — a parent whose children
  // all lack dates keeps whatever it had (nothing to summarize).
  const childStarts = siblings.map((s) => s.startDate).filter((d): d is Date => !!d);
  const childDues = siblings.map((s) => s.dueDate).filter((d): d is Date => !!d);
  if (childStarts.length > 0 || childDues.length > 0) {
    const nextStart = childStarts.length > 0 ? new Date(Math.min(...childStarts.map((d) => d.getTime()))) : null;
    const nextDue = childDues.length > 0 ? new Date(Math.max(...childDues.map((d) => d.getTime()))) : null;
    const startChanged = nextStart?.getTime() !== parent.startDate?.getTime();
    const dueChanged = nextDue?.getTime() !== parent.dueDate?.getTime();
    if (startChanged || dueChanged) {
      patch.startDate = nextStart;
      patch.dueDate = nextDue;
      if (nextStart && nextDue) {
        const { countWorkingDaysInclusive, loadSchedulingCalendar, toDateOnly } = await import("@/lib/scheduling");
        const cal = await loadSchedulingCalendar();
        const days = countWorkingDaysInclusive(toDateOnly(nextStart), toDateOnly(nextDue), cal);
        patch.durationDays = Math.max(1, days);
      } else {
        patch.durationDays = null;
      }
    }
  }

  if (Object.keys(patch).length === 0) return false;
  await db.task.update({ where: { id: parentId }, data: patch });
  return true;
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
