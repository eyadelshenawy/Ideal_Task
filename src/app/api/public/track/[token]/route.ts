import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { notify } from "@/lib/inAppNotify";
import { sendEmail } from "@/lib/email";
import { customerReplyEmailHtml } from "@/lib/notifications";

// Public, unauthenticated — the token is the only gate. Deliberately
// minimal: status of one ticket, nothing about the rest of the project,
// no comments/attachments/assignee names.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: {
      code: true, title: true, status: true, dueDate: true, progress: true, deletedAt: true,
      project: { select: { name: true } },
    },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  return NextResponse.json({
    code: task.code,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    projectName: task.project?.name ?? null,
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
  const parsed = replySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
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

  await prisma.taskEvent.create({
    data: { taskId: task.id, type: "COMMENT", authorId: null, message: `[Customer] ${parsed.data.message}` },
  });

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
