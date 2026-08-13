import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nextTaskCode } from "@/lib/taskCode";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/inAppNotify";
import { uploadToR2, r2Configured } from "@/lib/r2";
import { sendEmail } from "@/lib/email";
import { newTicketEmailHtml } from "@/lib/notifications";

// Public, unauthenticated — the token is the only gate. Only ever returns
// the project's name, never anything else about it.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { name: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }
  return NextResponse.json({ projectName: project.name });
}

// Best-effort in-memory rate limit — resets on every deploy/restart, which
// is an acceptable tradeoff for a small internal tool; not meant to survive
// a determined attacker, just to blunt casual spam.
const submissionsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  submissionsByIp.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const submitSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(200),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  // Honeypot — a real visitor never sees or fills this field. Deliberately
  // unconstrained (no max(0)) so a bot that fills it still passes schema
  // validation and reaches the check below, which fakes a success response
  // instead of revealing that it was rejected.
  website: z.string().optional(),
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — tighter than the logged-in 25MB cap, since this endpoint is unauthenticated.
const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Please fill in the required fields" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse({
    title: form.get("title"),
    description: form.get("description") || undefined,
    contactName: form.get("contactName"),
    contactEmail: form.get("contactEmail"),
    priority: form.get("priority") || undefined,
    website: form.get("website") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in the required fields" }, { status: 400 });
  }
  // Honeypot tripped — pretend success so a bot doesn't learn to adapt.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true, trackingToken: crypto.randomBytes(9).toString("base64url") }, { status: 201 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many submissions — please try again later" }, { status: 429 });
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

  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const { title, description, contactName, contactEmail, priority } = parsed.data;

  // Scoped to this project — the same name submitting a ticket to a
  // different project becomes a separate Contact, matching the rule that a
  // contact belongs to one project's people, not a global directory.
  const contact =
    (await prisma.contact.findFirst({ where: { name: contactName, projectId: project.id } })) ??
    (await prisma.contact.create({ data: { name: contactName, projectId: project.id } }));

  const code = await nextTaskCode(prisma, project.id);
  const fullDescription = [description, `Submitted by ${contactName} (${contactEmail})`].filter(Boolean).join("\n\n");
  const trackingToken = crypto.randomBytes(9).toString("base64url");

  const task = await prisma.task.create({
    data: {
      code,
      title,
      description: fullDescription,
      projectId: project.id,
      status: "TODO",
      priority,
      contactAssignees: { connect: [{ id: contact.id }] },
      trackingToken,
    },
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
      console.error("intake attachment upload failed:", err);
    }
  }

  logActivity(task.id, null, "Submitted via public ticket form").catch((err) => console.error("logActivity failed:", err));

  const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, email: true } });
  notify(admins.map((a) => a.id), `New ticket from ${contactName}: "${title}"`, task.id).catch((err) =>
    console.error("intake notify failed:", err)
  );

  const adminEmails = admins.map((a) => a.email).filter(Boolean);
  if (adminEmails.length > 0) {
    sendEmail({
      to: adminEmails,
      subject: `New ticket: "${title}"`,
      html: newTicketEmailHtml({ title, description, priority, projectName: project.name, contactName }),
    }).catch((err) => console.error("intake email failed:", err));
  }

  return NextResponse.json({ ok: true, trackingToken }, { status: 201 });
}
