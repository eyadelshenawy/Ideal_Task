import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { notify } from "@/lib/inAppNotify";
import { sendEmail } from "@/lib/email";
import { customerReplyEmailHtml } from "@/lib/notifications";
import { uploadToR2, r2Configured } from "@/lib/r2";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — same cap as the public intake form's attachment.
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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

  return NextResponse.json({
    code: task.code,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    projectName: task.project?.name ?? null,
    thread,
  });
}

const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });

// Best-effort in-memory rate limit — same tradeoff as the intake endpoint's:
// resets on deploy/restart, just meant to blunt casual spam.
const repliesByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (repliesByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  repliesByIp.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

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

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File is too large (max 10MB)" }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "That file type isn't supported — please attach an image, PDF, or Word document" }, { status: 400 });
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
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

  const replyMessage = file instanceof File && file.size > 0
    ? `[Customer] ${parsed.data.message}\n\n📎 ${file.name}`
    : `[Customer] ${parsed.data.message}`;
  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "COMMENT", authorId: null, message: replyMessage },
  });

  if (file instanceof File && file.size > 0 && r2Configured()) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = `tasks/${task.id}/${Date.now()}-${file.name}`;
      await uploadToR2(key, buffer, file.type || "application/octet-stream");
      await prisma.attachment.create({
        data: { taskId: task.id, fileName: file.name, fileKey: key, fileSize: file.size, mimeType: file.type || "application/octet-stream" },
      });
    } catch (err) {
      console.error("track reply attachment upload failed:", err);
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
