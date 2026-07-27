import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskFullUpdateSchema, taskStatusUpdateSchema, assigneesToSet } from "@/lib/validation/task";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  const canFullyEdit = access.isSuperAdmin || (existing.projectId !== null && access.administeredProjectIds.includes(existing.projectId));
  const body = await req.json().catch(() => null);

  // Anyone without full-edit rights on this task's current project may only
  // move its status and adjust progress — everything else (title, dates,
  // assignees, priority, project, dependencies, milestone flag) requires
  // Super Admin or a project-admin grant on the task's project.
  if (!canFullyEdit) {
    const parsed = taskStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "You can only update status and progress on this task" }, { status: 403 });
    }
    const data = parsed.data;
    const nextStatus = data.status ?? existing.status;
    try {
      const task = await prisma.task.update({
        where: { id: params.id },
        data: {
          status: nextStatus,
          progress: nextStatus === "DONE" ? 100 : data.progress ?? existing.progress,
        },
        include: taskInclude,
      });
      return NextResponse.json(serializeTask(task));
    } catch {
      return NextResponse.json({ error: "Couldn't update task" }, { status: 400 });
    }
  }

  const parsed = taskFullUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const data = parsed.data;
  const nextStatus = data.status ?? existing.status;
  const dependsOn = data.dependsOn?.filter((id) => id !== params.id);

  // A Project-Admin editor (not Super Admin) may only move a task to another
  // project they themselves administer — never to null, never to a project
  // outside their grants. Super Admin is unrestricted.
  if (!access.isSuperAdmin && data.projectId !== undefined && data.projectId !== existing.projectId) {
    if (!data.projectId || !access.administeredProjectIds.includes(data.projectId)) {
      return NextResponse.json({ error: "You can only move this task to a project you administer" }, { status: 403 });
    }
  }

  try {
    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(data.code !== undefined ? { code: data.code || null } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.projectId !== undefined ? { projectId: data.projectId || null } : {}),
        ...(data.assignees !== undefined ? assigneesToSet(data.assignees) : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        status: nextStatus,
        ...(data.startDate !== undefined ? { startDate: dateStrToUTC(data.startDate) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: dateStrToUTC(data.dueDate) } : {}),
        progress: nextStatus === "DONE" ? 100 : data.progress ?? existing.progress,
        ...(data.isMilestone !== undefined ? { isMilestone: data.isMilestone } : {}),
        ...(dependsOn !== undefined ? { dependsOn: { set: dependsOn.map((id) => ({ id })) } } : {}),
      },
      include: taskInclude,
    });
    return NextResponse.json(serializeTask(task));
  } catch {
    return NextResponse.json({ error: "Couldn't update task — check the selected project/assignees/dependencies" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(existing.projectId && access.administeredProjectIds.includes(existing.projectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
