import type { Task } from "@/types/models";

export interface DependencyWarning {
  /** Task ids that already carry a real conflict of their own — a predecessor whose Due lands after this task's Start. */
  direct: Set<string>;
  /** Task ids that inherit a warning from an upstream conflict without one of their own — the "cascade" case. */
  cascaded: Set<string>;
}

/**
 * Compute the schedule-vs-dependency warnings across every visible task.
 * A task warns "direct" when it has a predecessor whose Due Date is strictly
 * later than its own Start Date — the two dates simply do not fit. A task
 * warns "cascaded" when any predecessor further up the chain has a direct
 * warning; that predecessor is going to slip, so anything downstream of it
 * effectively will too. Same list handles arbitrarily deep chains — a linear
 * pass keyed by finished ids does the whole tree.
 *
 * Called on every render of Dashboard / TaskModal — cheap for the sizes we
 * care about (hundreds to low thousands of tasks per user), and running
 * client-side means the check is always consistent with what the user sees.
 * Both DONE predecessors and DONE dependents drop out of the check — a
 * finished task never "blocks" anything and never inherits a warning.
 */
export function computeDependencyWarnings(tasks: Task[]): DependencyWarning {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const direct = new Set<string>();

  // Direct-conflict pass — for every task that has both a Start and at least
  // one dependency with a Due, flag if any predecessor's Due strictly beats
  // the task's Start. "Strictly" because a task can validly start the same
  // day its predecessor finishes.
  for (const t of tasks) {
    if (t.status === "DONE" || !t.startDate) continue;
    for (const depId of t.dependsOn) {
      const dep = byId.get(depId);
      if (!dep || dep.status === "DONE" || !dep.dueDate) continue;
      if (dep.dueDate > t.startDate) {
        direct.add(t.id);
        break;
      }
    }
  }

  // Cascade pass — walk the dependency graph forward from every direct
  // offender and mark reachable tasks. Uses a visited set so a cyclic graph
  // (blocked upstream by the API but defended against here too) doesn't loop.
  const cascaded = new Set<string>();
  const dependentsBy = new Map<string, string[]>();
  for (const t of tasks) {
    for (const depId of t.dependsOn) {
      const arr = dependentsBy.get(depId) ?? [];
      arr.push(t.id);
      dependentsBy.set(depId, arr);
    }
  }
  const visited = new Set<string>();
  const stack = [...direct];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const downstream = dependentsBy.get(id) ?? [];
    for (const dId of downstream) {
      const dTask = byId.get(dId);
      if (!dTask || dTask.status === "DONE") continue;
      if (!direct.has(dId)) cascaded.add(dId);
      stack.push(dId);
    }
  }

  return { direct, cascaded };
}

/** Human-readable label for the tooltip / banner on a warned task. */
export function describeDependencyWarning(
  taskId: string,
  tasks: Task[],
  warnings: DependencyWarning,
): string | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const t = byId.get(taskId);
  if (!t) return null;
  if (warnings.direct.has(taskId)) {
    const offenders = t.dependsOn
      .map((id) => byId.get(id))
      .filter((d): d is Task => !!d && d.status !== "DONE" && !!d.dueDate && !!t.startDate && d.dueDate > t.startDate)
      .map((d) => d.code || d.title)
      .slice(0, 3);
    return offenders.length > 0
      ? `Starts before ${offenders.join(", ")} finish${offenders.length === 1 ? "es" : ""}`
      : "Starts before a predecessor finishes";
  }
  if (warnings.cascaded.has(taskId)) {
    return "Blocked by an upstream predecessor that will slip";
  }
  return null;
}
