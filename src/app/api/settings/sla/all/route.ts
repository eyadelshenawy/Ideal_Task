import { NextResponse } from "next/server";
import { requireSession } from "@/lib/permissions";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides } from "@/lib/slaConfig";

/** Everything Reports needs to compute per-task SLA in one round trip: the shared default plus every project's override. */
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const [defaultConfig, overrides] = await Promise.all([loadDefaultSlaConfig(), loadAllProjectSlaOverrides()]);
  return NextResponse.json({ default: defaultConfig, overrides });
}
