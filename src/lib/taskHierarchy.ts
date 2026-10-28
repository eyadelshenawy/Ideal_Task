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
 * otherwise), and startDate / dueDate / durationDays only ever widen so the
 * parent covers every child: start = earlier of its own start and the earliest
 * child start, due = later of its own due and the latest child due, duration
 * recomputed as working days across that span. A parent never shrinks on its
 * own; shrinking it by hand below its children is refused (see childDateSpan).
 * Returns whether the parent's stored row actually changed — the ancestor loop
 * uses that to stop when nothing propagates further up.
 */
async function recomputeOneLevel(db: Db, parentId: string): Promise<boolean> {
  const [parent, siblings] = await Promise.all([
    db.task.findUnique({
      where: { id: parentId },
      select: { status: true, progress: true, startDate: true, dueDate: true, durationDays: true, isMilestone: true, pausedAt: true },
    }),
    db.task.findMany({
      where: { parentId, deletedAt: null },
      select: { status: true, progress: true, startDate: true, dueDate: true },
    }),
  ]);
  if (!parent) return false;

  const patch: {
    status?: "DONE" | "INPROGRESS";
    progress?: number;
    pausedAt?: null;
    startDate?: Date | null;
    dueDate?: Date | null;
    durationDays?: number | null;
  } = {};

  const allDone = siblings.length > 0 && siblings.every((s) => s.status === "DONE");
  if (allDone && parent.status !== "DONE") {
    patch.status = "DONE";
    // Done ends any wait on the customer it was in.
    if (parent.pausedAt) patch.pausedAt = null;
  } else if (!allDone && parent.status === "DONE") {
    patch.status = "INPROGRESS";
  }

  // A main task's progress comes from its subtasks:
  // progress = Σ subtask progress ÷ number of subtasks (a Done subtask counts as 100%).
  if (siblings.length > 0) {
    const average = Math.round(siblings.reduce((sum, s) => sum + (s.status === "DONE" ? 100 : s.progress), 0) / siblings.length);
    if (average !== parent.progress) patch.progress = average;
  }

  // A milestone parent marks the moment its subtasks are all due: its single
  // date follows the latest subtask due, both ways, and it keeps no Start.
  if (parent.isMilestone) {
    const dues = siblings.map((s) => s.dueDate).filter((d): d is Date => !!d);
    if (dues.length > 0) {
      const nextDue = new Date(Math.max(...dues.map((d) => d.getTime())));
      if (nextDue.getTime() !== parent.dueDate?.getTime()) patch.dueDate = nextDue;
    }
    if (parent.startDate || parent.durationDays) {
      patch.startDate = null;
      patch.durationDays = null;
    }
    if (Object.keys(patch).length === 0) return false;
    await db.task.update({ where: { id: parentId }, data: patch });
    return true;
  }

  // Date rollup: widen only — the parent's own dates count alongside its
  // children's, so it grows to cover them but never shrinks on its own.
  const childStarts = [parent.startDate, ...siblings.map((s) => s.startDate)].filter((d): d is Date => !!d);
  const childDues = [parent.dueDate, ...siblings.map((s) => s.dueDate)].filter((d): d is Date => !!d);
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
 * Earliest start and latest due across a task's (non-deleted) subtasks, as
 * "YYYY-MM-DD" — the span its own dates must keep covering.
 */
export async function childDateSpan(db: Db, parentId: string): Promise<{ start: string | null; due: string | null }> {
  const children = await db.task.findMany({ where: { parentId, deletedAt: null }, select: { startDate: true, dueDate: true } });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const starts = children.map((c) => c.startDate).filter((d): d is Date => !!d).map(day).sort();
  const dues = children.map((c) => c.dueDate).filter((d): d is Date => !!d).map(day).sort();
  return { start: starts[0] ?? null, due: dues[dues.length - 1] ?? null };
}

/** The message when new dates for a main task would no longer cover its subtasks, or null if they do. */
export function uncoveredSpanError(span: { start: string | null; due: string | null }, start: string | null, due: string | null): string | null {
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const tooLate = !!(span.start && start && start > span.start);
  const tooEarly = !!(span.due && due && due < span.due);
  if (!tooLate && !tooEarly) return null;
  return `Subtasks run from ${fmt(span.start ?? start!)} to ${fmt(span.due ?? due!)} — the main task's dates must cover them`;
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
