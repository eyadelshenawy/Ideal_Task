import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess, getUserAccess } from "@/lib/permissions";
import { dateStrToUTC } from "@/lib/serverDates";

function serializeEntry(e: { id: string; hours: number; date: Date; note: string | null; userId: string | null; createdAt: Date; user: { name: string } | null }) {
  return {
    id: e.id,
    hours: e.hours,
    date: e.date.toISOString().slice(0, 10),
    note: e.note,
    userId: e.userId,
    userName: e.user?.name ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const entries = await prisma.timeEntry.findMany({
    where: { taskId: params.id },
    include: { user: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(entries.map(serializeEntry));
}

// A logged block of time is deliberately manual, not a timer — just "I spent
// N hours on this, on this date." Capped at 24h/entry as a sanity bound, not
// a real-world limit anyone should hit.
const createSchema = z.object({
  hours: z.number().min(0.25).max(24),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  note: z.string().trim().max(300).optional(),
  // Super Admins and Project Admins can log time on behalf of another team
  // member (e.g. someone who forgot to log their own). Everyone else has
  // this field silently ignored — they can only log for themselves.
  userId: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid time entry" }, { status: 400 });
  }

  let logForUserId = session.user.id;
  if (parsed.data.userId && parsed.data.userId !== session.user.id) {
    const task = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
    const access = await getUserAccess(session);
    const canLogForOthers = access.isSuperAdmin || (!!task?.projectId && access.administeredProjectIds.includes(task.projectId));
    if (!canLogForOthers) {
      return NextResponse.json({ error: "Only Super Admins and Project Managers can log time for someone else" }, { status: 403 });
    }
    logForUserId = parsed.data.userId;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      taskId: params.id,
      userId: logForUserId,
      hours: parsed.data.hours,
      date: dateStrToUTC(parsed.data.date)!,
      note: parsed.data.note || null,
    },
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json(serializeEntry(entry), { status: 201 });
}
