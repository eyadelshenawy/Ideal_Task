import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/permissions";
import { taskFullUpdateSchema, taskStatusUpdateSchema } from "@/lib/validation/task";
import { serializeTask } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "ADMIN";
  const body = await req.json().catch(() => null);

  // Members may only move status and adjust progress — everything else (title,
  // dates, assignee, priority, project, dependencies, milestone flag) is
  // Admin-only, enforced here regardless of what the client sends.
  if (!isAdmin) {
    const parsed = taskStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Members can only update status and progress" }, { status: 403 });
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
        include: { dependsOn: { select: { id: true } } },
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

  try {
    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(data.code !== undefined ? { code: data.code || null } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.projectId !== undefined ? { projectId: data.projectId || null } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId || null } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        status: nextStatus,
        ...(data.startDate !== undefined ? { startDate: dateStrToUTC(data.startDate) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: dateStrToUTC(data.dueDate) } : {}),
        progress: nextStatus === "DONE" ? 100 : data.progress ?? existing.progress,
        ...(data.isMilestone !== undefined ? { isMilestone: data.isMilestone } : {}),
        ...(dependsOn !== undefined ? { dependsOn: { set: dependsOn.map((id) => ({ id })) } } : {}),
      },
      include: { dependsOn: { select: { id: true } } },
    });
    return NextResponse.json(serializeTask(task));
  } catch {
    return NextResponse.json({ error: "Couldn't update task — check the selected project/assignee/dependencies" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  await prisma.task.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
