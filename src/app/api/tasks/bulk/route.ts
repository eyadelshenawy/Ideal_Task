import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskBulkUpdateSchema, taskBulkDeleteSchema, assigneesToSet } from "@/lib/validation/task";
import { notifyAssignment } from "@/lib/notifications";
import { logActivity, describeTaskChanges, loadNameLookups } from "@/lib/activity";
import { createNextOccurrence } from "@/lib/recurrence";
import { getDescendantIds, syncAncestorChain } from "@/lib/taskHierarchy";

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
  const { taskIds, status, assignees, projectId } = parsed.data;
  const access = await getUserAccess(session);

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, deletedAt: null },
    include: { assignees: { select: { id: true } }, contactAssignees: { select: { id: true } } },
  });

  const updated: string[] = [];
  const skipped: string[] = [];
  // A status-only bulk change (no assignee/project change bundled in) follows
  // the same rule as a single-task status update: any assignee may do it,
  // not just Super Admin / a project-admin grant holder.
  const isStatusOnly = assignees === undefined && projectId === undefined;

  for (const task of tasks) {
    const canManage = access.isSuperAdmin || (task.projectId !== null && access.administeredProjectIds.includes(task.projectId));
    const isAssignee = task.assignees.some((a) => a.id === session.user.id);
    if (!canManage && !(isStatusOnly && isAssignee)) {
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

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(status !== undefined ? { status, progress: status === "DONE" ? 100 : undefined } : {}),
        ...(assignees !== undefined ? assigneesToSet(assignees) : {}),
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
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
