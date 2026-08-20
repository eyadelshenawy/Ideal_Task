import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { notify } from "@/lib/inAppNotify";
import { sendEmail } from "@/lib/email";
import { customerReplyEmailHtml } from "@/lib/notifications";
import { uploadToR2, r2Configured } from "@/lib/r2";
import { MAX_FILE_SIZE, MAX_TOTAL_SIZE, ALLOWED_MIME_TYPES } from "@/lib/uploadLimits";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";

// Same markers TaskActivityPanel.tsx uses to tag customer-facing comments —
// only these ever get exposed on this public, unauthenticated endpoint.
// Internal team comments and the activity log are never included here.
const TO_CUSTOMER_PREFIX = "[To customer] ";
const FROM_CUSTOMER_PREFIX = "[Customer] ";

// Public, unauthenticated — the token is the only gate. Deliberately
// minimal: status of one ticket plus the customer-facing message thread —
// nothing about the rest of the project, internal comments, or activity log.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: {
      id: true, code: true, title: true, status: true, dueDate: true, progress: true, deletedAt: true,
      project: { select: { name: true } },
    },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const events = await prisma.taskEvent.findMany({
    where: {
      taskId: task.id,
      type: "COMMENT",
      OR: [{ message: { startsWith: TO_CUSTOMER_PREFIX } }, { message: { startsWith: FROM_CUSTOMER_PREFIX } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, message: true, createdAt: true },
  });
  const thread = events.map((e) => {
    const fromTeam = e.message.startsWith(TO_CUSTOMER_PREFIX);
    return {
      id: e.id,
      from: fromTeam ? "team" : "customer",
      message: fromTeam ? e.message.slice(TO_CUSTOMER_PREFIX.length) : e.message.slice(FROM_CUSTOMER_PREFIX.length),
      createdAt: e.createdAt.toISOString(),
    };
  });

  // Only id + fileName + createdAt — enough for the client to turn a "📎 name"
  // line in the thread into a download link, nothing else about the task.
  const attachments = await prisma.attachment.findMany({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, createdAt: true },
  });

  return NextResponse.json({
    code: task.code,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    projectName: task.project?.name ?? null,
    thread,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, createdAt: a.createdAt.toISOString() })),
  });
}

const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });

// Public, unauthenticated — logs a Comment on the task (marked as from the
// customer) and notifies the task's assignees + Super Admins, mirroring the
// existing comment/new-ticket notification patterns.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const parsed = replySchema.safeParse({ message: form.get("message") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `"${f.name}" is too large (max 10MB each)` }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(f.type)) {
      return NextResponse.json({ error: `"${f.name}" isn't a supported type — please attach images, PDFs, or Word documents` }, { status: 400 });
    }
  }
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json({ error: "Attachments are too large together (max 25MB combined) — try fewer or smaller files" }, { status: 400 });
  }

  if (checkRateLimit(`track-reply:${ipFromRequest(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many replies — please try again later" }, { status: 429 });
  }

  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: {
      id: true, title: true, dueDate: true, priority: true, deletedAt: true,
      project: { select: { name: true } },
      assignees: { select: { id: true } },
      contactAssignees: { select: { name: true } },
    },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const replyMessage = files.length > 0
    ? `[Customer] ${parsed.data.message}\n\n${files.map((f) => `📎 ${f.name}`).join("\n")}`
    : `[Customer] ${parsed.data.message}`;
  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "COMMENT", authorId: null, message: replyMessage },
  });

  if (r2Configured()) {
    for (const f of files) {
      try {
        const buffer = Buffer.from(await f.arrayBuffer());
        const key = `tasks/${task.id}/${Date.now()}-${f.name}`;
        await uploadToR2(key, buffer, f.type || "application/octet-stream");
        await prisma.attachment.create({
          data: { taskId: task.id, fileName: f.name, fileKey: key, fileSize: f.size, mimeType: f.type || "application/octet-stream" },
        });
      } catch (err) {
        console.error("track reply attachment upload failed:", err);
      }
    }
  }

  const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, email: true } });
  const assignees = await prisma.user.findMany({ where: { id: { in: task.assignees.map((a) => a.id) }, active: true }, select: { id: true, email: true } });
  const recipients = [...admins, ...assignees.filter((a) => !admins.some((ad) => ad.id === a.id))];
  const contactName = task.contactAssignees[0]?.name ?? "The customer";

  notify(recipients.map((r) => r.id), `${contactName} replied on "${task.title}"`, task.id).catch((err) =>
    console.error("track reply notify failed:", err)
  );

  const emails = recipients.map((r) => r.email).filter(Boolean);
  if (emails.length > 0) {
    sendEmail({
      to: emails,
      subject: `${contactName} replied: "${task.title}"`,
      html: customerReplyEmailHtml(
        { title: task.title, projectName: task.project?.name ?? null, dueDate: utcToDateStr(task.dueDate), priority: task.priority },
        contactName,
        parsed.data.message
      ),
    }).catch((err) => console.error("track reply email failed:", err));
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
