import { NextResponse } from "next/server";
import { requireSession } from "@/lib/permissions";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides, loadBusinessCalendar } from "@/lib/slaConfig";

/** Everything the client needs to compute per-task SLA in one round trip: the shared default, every project's override, and the working-hours calendar. */
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const [defaultConfig, overrides, calendar] = await Promise.all([loadDefaultSlaConfig(), loadAllProjectSlaOverrides(), loadBusinessCalendar()]);
  return NextResponse.json({ default: defaultConfig, overrides, calendar });
}
