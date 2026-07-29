import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { addComment } from "@/lib/activity";

function serializeEvent(e: { id: string; type: string; message: string; createdAt: Date; author: { name: string } | null }) {
  return {
    id: e.id,
    type: e.type,
    message: e.message,
    authorName: e.author?.name ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSession();
  if (error) return error;

  const events = await prisma.taskEvent.findMany({
    where: { taskId: params.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(events.map(serializeEvent));
}

const commentSchema = z.object({ message: z.string().trim().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const event = await addComment(params.id, session.user.id, parsed.data.message);
  const withAuthor = await prisma.taskEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(serializeEvent(withAuthor), { status: 201 });
}
