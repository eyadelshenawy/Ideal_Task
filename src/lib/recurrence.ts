import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { nextTaskCode } from "@/lib/taskCode";
import { nextChildCode } from "@/lib/taskHierarchy";
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

  const nextDue = computeNextDate(task.dueDate, task.recurrenceFreq);
  if (task.recurrenceEndDate && nextDue > task.recurrenceEndDate) return;

  const nextStart = task.startDate ? computeNextDate(task.startDate, task.recurrenceFreq) : null;

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
      isMilestone: task.isMilestone,
      recurrenceFreq: task.recurrenceFreq,
      recurrenceEndDate: task.recurrenceEndDate,
      createdById: task.createdById,
    },
  });

  await logActivity(next.id, task.createdById, "Auto-created as the next occurrence of a recurring task");
  await logActivity(task.id, task.createdById, `Created the next occurrence, due ${nextDue.toISOString().slice(0, 10)}`);
}
