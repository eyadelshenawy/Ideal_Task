import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { serializeTask, taskInclude } from "@/lib/serializers/task";

// Restore rights mirror delete rights: Super Admin for anything, or a
// Project-Admin grant on the task's project.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(existing.projectId && access.administeredProjectIds.includes(existing.projectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  const task = await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: null },
    include: taskInclude,
  });
  return NextResponse.json(serializeTask(task));
}
