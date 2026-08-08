import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { dateStrToUTC } from "@/lib/serverDates";

/** Per-person total hours logged within a date range, across every task visible to the requester. */
export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const access = await getUserAccess(session);
  const taskWhere = visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds);

  const grouped = await prisma.timeEntry.groupBy({
    by: ["userId"],
    where: {
      date: { gte: dateStrToUTC(from)!, lte: dateStrToUTC(to)! },
      userId: { not: null },
      task: taskWhere,
    },
    _sum: { hours: true },
  });

  const totals = Object.fromEntries(grouped.map((g) => [g.userId as string, g._sum.hours ?? 0]));
  return NextResponse.json(totals);
}
