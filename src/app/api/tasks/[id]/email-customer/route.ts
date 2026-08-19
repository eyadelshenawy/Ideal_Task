import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";
import { addComment, logActivity } from "@/lib/activity";
import { sendEmail } from "@/lib/email";
import { customerMessageEmailHtml } from "@/lib/notifications";
import { uploadToR2, r2Configured } from "@/lib/r2";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// Same per-file limit as the public intake form's attachment. MAX_TOTAL_SIZE
// caps the combined size of everything attached to one message — Resend
// rejects requests over ~40MB total, and the file also travels inline as
// base64 in the outbound email (inflates size ~33%), so this stays well
// under that ceiling regardless of how many files make it up.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const bodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  // Extra recipients typed in by hand — combined with the task's assigned
  // contact's email (if any), so this also covers tasks with no contact on
  // file yet (e.g. created internally, not via the public intake form).
  recipients: z.array(z.string().trim().email()),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  }

  const recipientsRaw = String(form.get("recipients") ?? "");
  const parsed = bodySchema.safeParse({
    message: form.get("message"),
    recipients: recipientsRaw.split(",").map((r) => r.trim()).filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Message can't be empty, and every recipient must be a valid email" }, { status: 400 });
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

  const emailAttachments: { filename: string; content: Buffer }[] = [];
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    emailAttachments.push({ filename: f.name, content: buffer });
    if (r2Configured()) {
      try {
        const key = `tasks/${task.id}/${Date.now()}-${f.name}`;
        await uploadToR2(key, buffer, f.type || "application/octet-stream");
        await prisma.attachment.create({
          data: { taskId: task.id, fileName: f.name, fileKey: key, fileSize: f.size, mimeType: f.type || "application/octet-stream", uploadedById: session.user.id },
        });
        await logActivity(task.id, session.user.id, `Attached "${f.name}"`);
      } catch (err) {
        console.error("email-customer attachment upload failed:", err);
      }
    }
  }

  await sendEmail({
    to: recipients,
    subject: task.code ? `${task.code} — ${task.title}` : task.title,
    html: customerMessageEmailHtml(
      { code: task.code, title: task.title, trackingUrl: `${APP_URL}/track/${trackingToken}` },
      parsed.data.message
    ),
    attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
  });

  const messageWithAttachments = files.length > 0
    ? `[To customer] ${parsed.data.message}\n\n${files.map((f) => `📎 ${f.name}`).join("\n")}`
    : `[To customer] ${parsed.data.message}`;
  const event = await addComment(task.id, session.user.id, messageWithAttachments);
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
