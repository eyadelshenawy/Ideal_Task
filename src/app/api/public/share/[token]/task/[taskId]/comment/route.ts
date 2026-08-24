import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { notify } from "@/lib/inAppNotify";
import { sendEmail } from "@/lib/email";
import { customerReplyEmailHtml } from "@/lib/notifications";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";
import { FROM_CUSTOMER_PREFIX } from "@/lib/customerThread";

const commentSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  message: z.string().trim().min(1, "Message can't be empty").max(5000),
});

// Public, unauthenticated. Lets a viewer of the project share link add a
// comment on any one of its tasks — mirrors the per-task tracking-link
// reply, but since the share link isn't tied to one specific contact the
// commenter has to type their own name each time. Stored with the same
// FROM_CUSTOMER_PREFIX marker as a per-task reply so it shows up on both
// links, and notifies assignees + Super Admins the same way.
export async function POST(req: NextRequest, { params }: { params: { token: string; taskId: string } }) {
  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid comment" }, { status: 400 });
  }

  if (checkRateLimit(`share-comment:${ipFromRequest(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many comments — please try again later" }, { status: 429 });
  }

  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { id: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      id: true, projectId: true, title: true, dueDate: true, priority: true, deletedAt: true,
      project: { select: { name: true } },
      assignees: { select: { id: true } },
    },
  });
  if (!task || task.deletedAt || task.projectId !== project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const commenterName = parsed.data.name;
  // The name is baked into the message so the customer thread on both
  // links attributes it to the specific person who wrote it — the share
  // link isn't tied to one contact record, so there's no other way to
  // recover their identity later.
  const storedMessage = `${FROM_CUSTOMER_PREFIX}${commenterName}: ${parsed.data.message}`;
  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "COMMENT", authorId: null, message: storedMessage },
  });

  const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, email: true } });
  const assignees = await prisma.user.findMany({ where: { id: { in: task.assignees.map((a) => a.id) }, active: true }, select: { id: true, email: true } });
  const recipients = [...admins, ...assignees.filter((a) => !admins.some((ad) => ad.id === a.id))];

  notify(recipients.map((r) => r.id), `${commenterName} commented on "${task.title}"`, task.id).catch((err) =>
    console.error("share comment notify failed:", err)
  );

  const emails = recipients.map((r) => r.email).filter(Boolean);
  if (emails.length > 0) {
    sendEmail({
      to: emails,
      subject: `${commenterName} commented: "${task.title}"`,
      html: customerReplyEmailHtml(
        { title: task.title, projectName: task.project?.name ?? null, dueDate: utcToDateStr(task.dueDate), priority: task.priority },
        commenterName,
        parsed.data.message
      ),
    }).catch((err) => console.error("share comment email failed:", err));
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
