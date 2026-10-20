import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { dateStrToUTC } from "@/lib/serverDates";

/**
 * Raw inputs for the Reports insight tabs that aren't already on the task
 * list: hours logged per task and day, and the Done / reopened status
 * changes from each task's activity log. Everything is limited to tasks the
 * requester can see (template projects excluded), from `from` onwards.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const from = req.nextUrl.searchParams.get("from");
  const fromDate = from ? dateStrToUTC(from) : null;
  if (!fromDate) return NextResponse.json({ error: "from is required" }, { status: 400 });

  const access = await getUserAccess(session);
  const taskWhere = {
    AND: [
      visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds),
      { OR: [{ projectId: null }, { project: { isTemplate: false } }] },
    ],
  };

  const [entries, events] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { date: { gte: fromDate }, task: taskWhere },
      select: { taskId: true, hours: true, date: true },
    }),
    prisma.taskEvent.findMany({
      where: {
        type: "ACTIVITY",
        createdAt: { gte: fromDate },
        message: { contains: "Status changed from" },
        task: taskWhere,
      },
      select: { taskId: true, message: true, createdAt: true },
    }),
  ]);

  const closed: { taskId: string; at: string }[] = [];
  const reopened: { taskId: string; at: string }[] = [];
  for (const e of events) {
    const at = e.createdAt.toISOString();
    if (/Status changed from Done to /.test(e.message)) reopened.push({ taskId: e.taskId, at });
    if (/Status changed from .+ to Done(\n|$)/.test(e.message)) closed.push({ taskId: e.taskId, at });
  }

  return NextResponse.json({
    time: entries.map((t) => ({ taskId: t.taskId, hours: t.hours, date: t.date.toISOString().slice(0, 10) })),
    closed,
    reopened,
  });
}
