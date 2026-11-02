/**
 * Which tasks the numbers count: the actual pieces of work. A task with
 * subtasks is only a container, so it is left out and its subtasks are
 * counted instead; a task with no subtasks counts as itself.
 *
 *   Count = number of tasks that have no subtasks
 *   e.g. ABM-0040 with 3 subtasks → 3 (not 4); a ticket with none → 1
 *
 * `all` is the full list used to see who has subtasks (defaults to `tasks`),
 * so a filtered list still knows that its parents are parents.
 */
export function countedTasks<T extends { id: string }>(
  tasks: T[],
  all: { parentId: string | null }[] = tasks as unknown as { parentId: string | null }[],
): T[] {
  const parentIds = new Set<string>();
  for (const t of all) if (t.parentId) parentIds.add(t.parentId);
  return tasks.filter((t) => !parentIds.has(t.id));
}
