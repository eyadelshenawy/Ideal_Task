import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { InsightsRaw } from "@/lib/reportInsights";

/**
 * Raw inputs for the Reports insight tabs: hours logged per task and day, and
 * the Done / reopened status changes from each task's activity log, for the
 * tasks matching `taskWhere`, from `fromDate` on. Shared by
 * GET /api/reports/insights and the MCP get_report tool.
 */
export async function insightsRaw(taskWhere: Prisma.TaskWhereInput, fromDate: Date): Promise<InsightsRaw> {
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

  return {
    time: entries.map((t) => ({ taskId: t.taskId, hours: t.hours, date: t.date.toISOString().slice(0, 10) })),
    closed,
    reopened,
  };
}

/** For each task, when its first real comment (not an activity line) was posted — the "first response". */
export async function firstCommentTimes(taskIds: string[]): Promise<Record<string, string>> {
  const comments = await prisma.taskEvent.findMany({
    where: { taskId: { in: taskIds }, type: "COMMENT" },
    select: { taskId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstCommentAt = new Map<string, string>();
  for (const c of comments) {
    if (!firstCommentAt.has(c.taskId)) firstCommentAt.set(c.taskId, c.createdAt.toISOString());
  }
  return Object.fromEntries(firstCommentAt);
}
