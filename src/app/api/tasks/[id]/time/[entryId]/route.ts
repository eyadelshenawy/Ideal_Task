import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess, getUserAccess } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const entry = await prisma.timeEntry.findUnique({ where: { id: params.entryId } });
  if (!entry || entry.taskId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  if (entry.userId !== session.user.id && !access.isSuperAdmin) {
    return NextResponse.json({ error: "You can only remove your own time entries" }, { status: 403 });
  }

  await prisma.timeEntry.delete({ where: { id: params.entryId } });
  return NextResponse.json({ ok: true });
}
