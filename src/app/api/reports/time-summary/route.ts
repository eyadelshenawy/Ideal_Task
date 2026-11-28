import { NextRequest, NextResponse } from "next/server";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { hoursByPerson } from "@/lib/reports/hoursByPerson";

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
  return NextResponse.json(await hoursByPerson(visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds), from, to));
}
