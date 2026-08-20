import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess, getUserAccess } from "@/lib/permissions";
import { dateStrToUTC } from "@/lib/serverDates";

// Owner OR (Super Admin) OR (Project Admin of the task's project) can
// edit/delete a time entry.
async function canManageEntry(
  session: Session,
  entryUserId: string | null,
  taskProjectId: string | null
): Promise<boolean> {
  if (entryUserId === session.user.id) return true;
  const access = await getUserAccess(session);
  if (access.isSuperAdmin) return true;
  return !!taskProjectId && access.administeredProjectIds.includes(taskProjectId);
}

const updateSchema = z.object({
  hours: z.number().min(0.25).max(24).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
  note: z.string().trim().max(300).nullable().optional(),
  userId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const entry = await prisma.timeEntry.findUnique({
    where: { id: params.entryId },
    include: { task: { select: { projectId: true } } },
  });
  if (!entry || entry.taskId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await canManageEntry(session, entry.userId, entry.task.projectId))) {
    return NextResponse.json({ error: "You can only edit your own time entries" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update" }, { status: 400 });
  }

  // Only Super Admin / Project Admin can re-assign an entry to someone else.
  if (parsed.data.userId && parsed.data.userId !== entry.userId) {
    const access = await getUserAccess(session);
    const canReassign = access.isSuperAdmin || (!!entry.task.projectId && access.administeredProjectIds.includes(entry.task.projectId));
    if (!canReassign) {
      return NextResponse.json({ error: "Only Super Admins and Project Managers can reassign a time entry" }, { status: 403 });
    }
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      ...(parsed.data.hours !== undefined ? { hours: parsed.data.hours } : {}),
      ...(parsed.data.date ? { date: dateStrToUTC(parsed.data.date)! } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note?.trim() || null } : {}),
      ...(parsed.data.userId ? { userId: parsed.data.userId } : {}),
    },
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json({
    id: updated.id,
    hours: updated.hours,
    date: updated.date.toISOString().slice(0, 10),
    note: updated.note,
    userId: updated.userId,
    userName: updated.user?.name ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const entry = await prisma.timeEntry.findUnique({
    where: { id: params.entryId },
    include: { task: { select: { projectId: true } } },
  });
  if (!entry || entry.taskId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await canManageEntry(session, entry.userId, entry.task.projectId))) {
    return NextResponse.json({ error: "You can only remove your own time entries" }, { status: 403 });
  }

  await prisma.timeEntry.delete({ where: { id: params.entryId } });
  return NextResponse.json({ ok: true });
}
