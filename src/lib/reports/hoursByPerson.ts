import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateStrToUTC } from "@/lib/serverDates";

/**
 * Hours logged per person between `from` and `to` (inclusive, YYYY-MM-DD) on
 * the tasks matching `taskWhere`; template projects are left out. Shared by
 * GET /api/reports/time-summary and the MCP get_report tool.
 */
export async function hoursByPerson(baseTaskWhere: Prisma.TaskWhereInput, from: string, to: string): Promise<Record<string, number>> {
  // Hours logged against template-project tasks aren't real work — same
  // exclusion the main task list uses so per-person totals stay clean.
  const taskWhere = {
    AND: [
      baseTaskWhere,
      { OR: [{ projectId: null }, { project: { isTemplate: false } }] },
    ],
  };
  const grouped = await prisma.timeEntry.groupBy({
    by: ["userId"],
    where: {
      date: { gte: dateStrToUTC(from)!, lte: dateStrToUTC(to)! },
      userId: { not: null },
      task: taskWhere,
    },
    _sum: { hours: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.userId as string, g._sum.hours ?? 0]));
}
