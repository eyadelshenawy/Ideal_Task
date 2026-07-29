import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskBulkUpdateSchema, taskBulkDeleteSchema, assigneesToSet } from "@/lib/validation/task";
import { notifyAssignment } from "@/lib/notifications";

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
    include: { assignees: { select: { id: true } } },
  });

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const task of tasks) {
    const canManage = access.isSuperAdmin || (task.projectId !== null && access.administeredProjectIds.includes(task.projectId));
    if (!canManage) {
      skipped.push(task.id);
      continue;
    }
    if (!access.isSuperAdmin && projectId !== undefined && projectId !== task.projectId) {
      if (!projectId || !access.administeredProjectIds.includes(projectId)) {
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
    });
    updated.push(task.id);

    if (assignees !== undefined) {
      const existingUserIds = new Set(task.assignees.map((a) => a.id));
      const newlyAssignedUserIds = assignees.filter((a) => a.type === "user" && !existingUserIds.has(a.id)).map((a) => a.id);
      notifyAssignment(updatedTask, newlyAssignedUserIds).catch((err) => console.error("notifyAssignment failed:", err));
    }
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
    select: { id: true, projectId: true },
  });

  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const task of tasks) {
    const canManage = access.isSuperAdmin || (task.projectId !== null && access.administeredProjectIds.includes(task.projectId));
    if (!canManage) {
      skipped.push(task.id);
      continue;
    }
    await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
    deleted.push(task.id);
  }

  return NextResponse.json({ deleted, skipped });
}
