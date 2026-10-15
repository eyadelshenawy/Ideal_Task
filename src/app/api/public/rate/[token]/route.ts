import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/inAppNotify";
import { checkRateLimit } from "@/lib/rateLimit";

// Customers may change their answer for this long after the survey was sent.
const EDIT_WINDOW_DAYS = 30;

async function load(token: string) {
  return prisma.satisfactionSurvey.findUnique({
    where: { token },
    select: {
      id: true, rating: true, comment: true, sentAt: true, taskId: true,
      task: { select: { code: true, title: true, project: { select: { name: true } }, assignees: { select: { id: true } } } },
    },
  });
}

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const s = await load(params.token);
  if (!s) return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  return NextResponse.json({
    code: s.task.code,
    title: s.task.title,
    projectName: s.task.project?.name ?? "",
    rating: s.rating,
    comment: s.comment,
  });
}

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() || "unknown";
  if (checkRateLimit(`rate:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please try again later" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please choose a rating from 1 to 5" }, { status: 400 });

  const s = await load(params.token);
  if (!s) return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  if (Date.now() - s.sentAt.getTime() > EDIT_WINDOW_DAYS * 86400000) {
    return NextResponse.json({ error: "This survey has closed" }, { status: 410 });
  }

  const comment = parsed.data.comment !== undefined ? parsed.data.comment || null : s.comment;
  const unchanged = s.rating === parsed.data.rating && s.comment === comment;
  await prisma.satisfactionSurvey.update({
    where: { id: s.id },
    data: { rating: parsed.data.rating, comment, respondedAt: new Date() },
  });

  if (!unchanged) {
    const line = `Customer rated ${parsed.data.rating}/5${comment ? ` — "${comment}"` : ""}`;
    await logActivity(s.taskId, null, line).catch((err) => console.error("logActivity failed:", err));
    notify(s.task.assignees.map((a) => a.id), `${line} on "${s.task.title}"`, s.taskId).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
