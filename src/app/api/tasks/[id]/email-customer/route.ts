import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";
import { addComment } from "@/lib/activity";
import { sendEmail } from "@/lib/email";
import { customerMessageEmailHtml } from "@/lib/notifications";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  // Extra recipients typed in by hand — combined with the task's assigned
  // contact's email (if any), so this also covers tasks with no contact on
  // file yet (e.g. created internally, not via the public intake form).
  recipients: z.array(z.string().trim().email()).optional().default([]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Message can't be empty, and every recipient must be a valid email" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true, code: true, title: true, trackingToken: true,
      contactAssignees: { select: { name: true, email: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contactRecipients = task.contactAssignees.filter((c) => c.email).map((c) => c.email as string);
  const recipients = Array.from(new Set([...contactRecipients, ...parsed.data.recipients]));
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipient — add an email for this task's contact, or type one in" }, { status: 400 });
  }

  const trackingToken = task.trackingToken ?? crypto.randomBytes(9).toString("base64url");
  if (!task.trackingToken) {
    await prisma.task.update({ where: { id: task.id }, data: { trackingToken } });
  }

  await sendEmail({
    to: recipients,
    subject: task.code ? `${task.code} — ${task.title}` : task.title,
    html: customerMessageEmailHtml(
      { code: task.code, title: task.title, trackingUrl: `${APP_URL}/track/${trackingToken}` },
      parsed.data.message
    ),
  });

  const event = await addComment(task.id, session.user.id, `[To customer] ${parsed.data.message}`);
  const withAuthor = await prisma.taskEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json({
    id: withAuthor.id,
    type: withAuthor.type,
    message: withAuthor.message,
    authorId: withAuthor.authorId,
    authorName: withAuthor.author?.name ?? null,
    createdAt: withAuthor.createdAt.toISOString(),
    editedAt: withAuthor.editedAt ? withAuthor.editedAt.toISOString() : null,
  }, { status: 201 });
}
