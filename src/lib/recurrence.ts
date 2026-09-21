import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { nextTaskCode } from "@/lib/taskCode";
import { nextChildCode, syncAncestorChain } from "@/lib/taskHierarchy";
import { loadSchedulingCalendar, resolveTaskDates, isWorkingDay, toDateOnly } from "@/lib/scheduling";
import { dateStrToUTC } from "@/lib/serverDates";
import type { RecurrenceFreq, Task } from "@prisma/client";

export function computeNextDate(date: Date, freq: RecurrenceFreq): Date {
  const d = new Date(date);
  if (freq === "DAILY") d.setUTCDate(d.getUTCDate() + 1);
  else if (freq === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  else if (freq === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

type RecurringTask = Task & {
  assignees: { id: string }[];
  contactAssignees: { id: string }[];
};

/**
 * Called after a task with a recurrenceFreq is marked DONE. Creates the next
 * occurrence one interval past the completed task's due date, carrying over
 * project/assignees/priority/recurrence settings. No-ops if the task isn't
 * recurring, has no due date to anchor from, or the next date would fall
 * after recurrenceEndDate.
 */
export async function createNextOccurrence(task: RecurringTask): Promise<void> {
  if (!task.recurrenceFreq || !task.dueDate) return;

  const naiveNextDue = computeNextDate(task.dueDate, task.recurrenceFreq);
  if (task.recurrenceEndDate && naiveNextDue > task.recurrenceEndDate) return;

  const naiveNextStart = task.startDate ? computeNextDate(task.startDate, task.recurrenceFreq) : null;

  // Rerun the coherent-triple math against the work calendar so a weekly
  // recurrence whose next start would land on a Friday/holiday shifts to
  // the next working day, and the due date is recomputed from the
  // preserved Duration (not the raw calendar-day math above).
  const cal = await loadSchedulingCalendar();
  let nextStart: Date | null = naiveNextStart;
  let nextDue: Date = naiveNextDue;
  if (naiveNextStart) {
    const naiveStartStr = toDateOnly(naiveNextStart);
    // Nudge start forward until it hits a working day so the next occurrence
    // doesn't open on the org's weekend.
    let cursor = naiveStartStr;
    while (!isWorkingDay(cursor, cal)) {
      cursor = toDateOnly(new Date(new Date(`${cursor}T00:00:00.000Z`).getTime() + 86400000));
    }
    const resolved = resolveTaskDates(
      { startDate: cursor, dueDate: null, durationDays: task.durationDays ?? null },
      cal,
      false,
    );
    if (resolved.startDate) nextStart = dateStrToUTC(resolved.startDate);
    if (resolved.dueDate) nextDue = dateStrToUTC(resolved.dueDate) ?? naiveNextDue;
  }
  if (task.recurrenceEndDate && nextDue > task.recurrenceEndDate) return;

  // Codes are unique, so the new occurrence needs a fresh one of its own —
  // reusing the same code (the original behavior here) would just fail the
  // create outright. A subtask gets the next hierarchical code off its
  // parent; anything else gets the next code in its project's sequence.
  const code = task.parentId
    ? await nextChildCode(prisma, task.parentId)
    : task.projectId
      ? await nextTaskCode(prisma, task.projectId)
      : null;

  const next = await prisma.task.create({
    data: {
      code,
      title: task.title,
      description: task.description,
      projectId: task.projectId,
      parentId: task.parentId,
      assignees: { connect: task.assignees.map((a) => ({ id: a.id })) },
      contactAssignees: { connect: task.contactAssignees.map((c) => ({ id: c.id })) },
      priority: task.priority,
      status: "TODO",
      progress: 0,
      startDate: nextStart,
      dueDate: nextDue,
      // Duration carries over as-is — a weekly-recurring 3-day task should
      // stay a 3-day task on every occurrence. The concrete Due here is
      // already computed above (nextDue), so this is just for consistency
      // with the field and any later recompute.
      durationDays: task.durationDays,
      isMilestone: task.isMilestone,
      recurrenceFreq: task.recurrenceFreq,
      recurrenceEndDate: task.recurrenceEndDate,
      createdById: task.createdById,
    },
  });

  await logActivity(next.id, task.createdById, "Auto-created as the next occurrence of a recurring task");
  await logActivity(task.id, task.createdById, `Created the next occurrence, due ${nextDue.toISOString().slice(0, 10)}`);

  // The new occurrence is a sibling of the completed one under the same
  // parent; its later Due extends the parent's rolled-up span. Without this
  // sync the parent keeps the old range and looks "done" when there's
  // actually an open, future occurrence under it. Awaited so callers that
  // read the parent immediately after (e.g. the PATCH response payload)
  // see the rolled-up state — every other syncAncestorChain call in the
  // codebase awaits, this now matches.
  if (next.parentId) {
    await syncAncestorChain(prisma, next.parentId).catch((err) =>
      console.error("recurrence syncAncestorChain failed:", err),
    );
  }
}
