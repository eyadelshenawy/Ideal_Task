import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";
import { addComment } from "@/lib/activity";
import { notify } from "@/lib/inAppNotify";
import { resolveMentions } from "@/lib/mentions";

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
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const events = await prisma.taskEvent.findMany({
    where: { taskId: params.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(events.map(serializeEvent));
}

// Long-form comments (specs, pasted logs, test notes) — cap is generous
// headroom, not a realistic ceiling anyone should hit.
const commentSchema = z.object({ message: z.string().trim().min(1).max(20000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, assignees: { select: { id: true } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const event = await addComment(params.id, session.user.id, parsed.data.message);
  const withAuthor = await prisma.taskEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: { author: { select: { name: true } } },
  });

  const authorName = withAuthor.author?.name ?? "Someone";
  const assigneeIds = new Set(task.assignees.map((a) => a.id));
  const notifyIds = [...assigneeIds].filter((id) => id !== session.user.id);
  notify(notifyIds, `${authorName} commented on "${task.title}"`, task.id);

  // A mention gets its own, more specific notification — including for
  // someone who isn't an assignee at all, and skipping anyone who'd already
  // get the generic "commented on" one above.
  const mentioned = await resolveMentions(parsed.data.message);
  const mentionIds = mentioned.map((m) => m.id).filter((id) => id !== session.user.id && !assigneeIds.has(id));
  if (mentionIds.length > 0) {
    notify(mentionIds, `${authorName} mentioned you in a comment on "${task.title}"`, task.id);
  }

  return NextResponse.json(serializeEvent(withAuthor), { status: 201 });
}
