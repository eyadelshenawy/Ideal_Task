import { NextRequest, NextResponse } from "next/server";
import { checkSlaRisks } from "@/lib/slaRisk";

// Runs every 15 minutes during working hours (see .github/workflows/sla-check.yml)
// so short deadlines, e.g. a 4-hour Critical response, get a warning in time.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkSlaRisks(new Date());
  return NextResponse.json({ ok: true, ...result });
}
