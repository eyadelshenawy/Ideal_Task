import { NextRequest, NextResponse } from "next/server";
import { checkSlaRisks } from "@/lib/slaRisk";
import { loadWorkDays } from "@/lib/scheduling";
import { isWorkDay } from "@/lib/workdays";

// Runs every 15 minutes during working hours (see .github/workflows/sla-check.yml)
// so short deadlines, e.g. a 4-hour Critical response, get a warning in time.
// The workflow fires every day; weekends and holidays (Work Calendar) are
// skipped here, so changing the calendar needs no workflow edit.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!isWorkDay(today, await loadWorkDays())) {
    return NextResponse.json({ ok: true, skipped: "not a working day" });
  }
  const result = await checkSlaRisks(new Date());
  return NextResponse.json({ ok: true, ...result });
}
