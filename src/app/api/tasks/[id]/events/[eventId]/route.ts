import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess, getUserAccess } from "@/lib/permissions";

function serializeEvent(e: { id: string; type: string; message: string; createdAt: Date; editedAt: Date | null; authorId: string | null; author: { name: string } | null }) {
  return {
    id: e.id,
    type: e.type,
    message: e.message,
    authorId: e.authorId,
    authorName: e.author?.name ?? null,
    createdAt: e.createdAt.toISOString(),
    editedAt: e.editedAt ? e.editedAt.toISOString() : null,
  };
}

const commentSchema = z.object({ message: z.string().trim().min(1).max(20000) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const event = await prisma.taskEvent.findUnique({ where: { id: params.eventId } });
  if (!event || event.taskId !== params.id || event.type !== "COMMENT") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await getUserAccess(session);
  if (event.authorId !== session.user.id && !access.isSuperAdmin) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }

  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  }

  const updated = await prisma.taskEvent.update({
    where: { id: params.eventId },
    data: { message: parsed.data.message, editedAt: new Date() },
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json(serializeEvent(updated));
}
