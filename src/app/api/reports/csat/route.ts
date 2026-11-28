import { NextResponse } from "next/server";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { csatSummary } from "@/lib/reports/csat";

// Customer satisfaction summary for the tickets this user can see.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const access = await getUserAccess(session);
  return NextResponse.json(await csatSummary(visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds)));
}
