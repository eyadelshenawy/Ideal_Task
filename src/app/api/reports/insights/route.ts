import { NextRequest, NextResponse } from "next/server";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { dateStrToUTC } from "@/lib/serverDates";
import { insightsRaw } from "@/lib/reports/insightsData";

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
  return NextResponse.json(await insightsRaw(taskWhere, fromDate));
}
