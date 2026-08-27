import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskBulkUpdateSchema, taskBulkDeleteSchema, assigneesToSet } from "@/lib/validation/task";
import { notifyAssignment } from "@/lib/notifications";
import { logActivity, describeTaskChanges, loadNameLookups } from "@/lib/activity";
import { createNextOccurrence } from "@/lib/recurrence";
import { getDescendantIds, syncAncestorChain } from "@/lib/taskHierarchy";
import { resolveTags } from "@/lib/tags";
import { dateStrToUTC } from "@/lib/serverDates";

// Bulk edit: same patch (status / assignees / project) applied to every task
// id the requester is allowed to manage. Ids they can't manage are silently
// skipped and reported back as `skipped`, so a partial selection still goes
// through for the tasks that are actually theirs to touch.
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = taskBulkUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { taskIds, status, assignees, projectId, priority, startDate, dueDate, progress, module, addTag, removeTag } = parsed.data;
  const access = await getUserAccess(session);

  // Resolve tag names once for the whole batch — same helper the import path
  // uses. Missing addTag creates the tag automatically; removeTag simply
  // no-ops on tasks that don't have that tag connected.
  const addTagRecord = addTag ? (await resolveTags([addTag]))[0] : null;
  const removeTagRecord = removeTag
    ? (await prisma.tag.findFirst({ where: { name: { equals: removeTag, mode: "insensitive" } }, select: { id: true } }))
    : null;

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, deletedAt: null },
    include: { assignees: { select: { id: true } }, contactAssignees: { select: { id: true } } },
  });

  const updated: string[] = [];
  const skipped: string[] = [];
  // A status-or-progress-only bulk change follows the same rule as a
  // single-task status/progress update: any assignee may do it, not just
  // Super Admin / a project-admin grant holder. Any of the other fields
  // being touched requires manage rights on the task's project.
  const touchesOnlyStatusOrProgress =
    assignees === undefined && projectId === undefined && priority === undefined &&
    startDate === undefined && dueDate === undefined && module === undefined &&
    addTag === undefined && removeTag === undefined;

  for (const task of tasks) {
    const canManage = access.isSuperAdmin || (task.projectId !== null && access.administeredProjectIds.includes(task.projectId));
    const isAssignee = task.assignees.some((a) => a.id === session.user.id);
    if (!canManage && !(touchesOnlyStatusOrProgress && isAssignee)) {
      skipped.push(task.id);
      continue;
    }
    if (!access.isSuperAdmin && projectId !== undefined && projectId !== task.projectId) {
      if (!projectId || !access.administeredProjectIds.includes(projectId)) {
        skipped.push(task.id);
        continue;
      }
    }
    // Moving a task with subtasks to a different project would strand them —
    // same guard as the single-task PATCH endpoint.
    if (projectId !== undefined && projectId !== task.projectId) {
      const childCount = await prisma.task.count({ where: { parentId: task.id, deletedAt: null } });
      if (childCount > 0) {
        skipped.push(task.id);
        continue;
      }
    }

    // Same auto-track rule as the single-task PATCH endpoint: stamp
    // completedAt the moment a task first becomes DONE, clear it if reopened.
    const completedAtUpdate =
      status === "DONE" && task.status !== "DONE"
        ? new Date()
        : status !== undefined && status !== "DONE" && task.status === "DONE"
          ? null
          : undefined;

    // A standalone bulk progress change becomes the new progress (unless
    // combined with status=DONE, which forces 100 above).
    const progressUpdate =
      status === "DONE"
        ? undefined
        : progress !== undefined
          ? progress
          : undefined;

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(status !== undefined ? { status, progress: status === "DONE" ? 100 : undefined } : {}),
        ...(progressUpdate !== undefined ? { progress: progressUpdate } : {}),
        ...(completedAtUpdate !== undefined ? { completedAt: completedAtUpdate } : {}),
        ...(assignees !== undefined ? assigneesToSet(assignees) : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(startDate !== undefined ? { startDate: dateStrToUTC(startDate) } : {}),
        ...(dueDate !== undefined ? { dueDate: dateStrToUTC(dueDate) } : {}),
        ...(module !== undefined ? { module: module || null } : {}),
        ...(addTagRecord ? { tags: { connect: [{ id: addTagRecord.id }] } } : {}),
        ...(removeTagRecord ? { tags: { disconnect: [{ id: removeTagRecord.id }] } } : {}),
      },
      include: { assignees: { select: { id: true } }, contactAssignees: { select: { id: true } } },
    });
    updated.push(task.id);

    if (status === "DONE" && task.status !== "DONE" && updatedTask.recurrenceFreq) {
      createNextOccurrence(updatedTask).catch((err) => console.error("createNextOccurrence failed:", err));
    }

    if (status !== undefined && status !== task.status && updatedTask.parentId) {
      await syncAncestorChain(prisma, updatedTask.parentId);
    }

    if (assignees !== undefined) {
      const existingUserIds = new Set(task.assignees.map((a) => a.id));
      const newlyAssignedUserIds = assignees.filter((a) => a.type === "user" && !existingUserIds.has(a.id)).map((a) => a.id);
      notifyAssignment(updatedTask, newlyAssignedUserIds).catch((err) => console.error("notifyAssignment failed:", err));
    }

    (async () => {
      const beforeSnapshot = {
        title: task.title, status: task.status, priority: task.priority, projectId: task.projectId,
        dueDate: task.dueDate, startDate: task.startDate, isMilestone: task.isMilestone,
        assigneeIds: task.assignees.map((a) => a.id), contactAssigneeIds: task.contactAssignees.map((c) => c.id),
      };
      const afterSnapshot = {
        title: updatedTask.title, status: updatedTask.status, priority: updatedTask.priority, projectId: updatedTask.projectId,
        dueDate: updatedTask.dueDate, startDate: updatedTask.startDate, isMilestone: updatedTask.isMilestone,
        assigneeIds: updatedTask.assignees.map((a) => a.id), contactAssigneeIds: updatedTask.contactAssignees.map((c) => c.id),
      };
      const lookups = await loadNameLookups({
        userIds: [...beforeSnapshot.assigneeIds, ...afterSnapshot.assigneeIds],
        contactIds: [...beforeSnapshot.contactAssigneeIds, ...afterSnapshot.contactAssigneeIds],
        projectIds: [task.projectId, updatedTask.projectId].filter((id): id is string => !!id),
      });
      const lines = describeTaskChanges(beforeSnapshot, afterSnapshot, lookups);
      if (lines.length > 0) await logActivity(task.id, session.user.id, lines.join("\n"));
    })().catch((err) => console.error("activity logging failed:", err));
  }

  return NextResponse.json({ updated, skipped });
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = taskBulkDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { taskIds } = parsed.data;
  const access = await getUserAccess(session);

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, deletedAt: null },
    select: { id: true, projectId: true, parentId: true },
  });

  const deleted: string[] = [];
  const skipped: string[] = [];
  const parentIdsToSync = new Set<string>();
  for (const task of tasks) {
    const canManage = access.isSuperAdmin || (task.projectId !== null && access.administeredProjectIds.includes(task.projectId));
    if (!canManage) {
      skipped.push(task.id);
      continue;
    }
    const descendantIds = await getDescendantIds(prisma, task.id);
    await prisma.task.updateMany({ where: { id: { in: [task.id, ...descendantIds] } }, data: { deletedAt: new Date() } });
    deleted.push(task.id);
    if (task.parentId) parentIdsToSync.add(task.parentId);
  }

  for (const parentId of parentIdsToSync) {
    await syncAncestorChain(prisma, parentId);
  }

  return NextResponse.json({ deleted, skipped });
}
