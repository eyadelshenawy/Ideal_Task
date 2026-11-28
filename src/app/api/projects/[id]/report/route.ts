import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/permissions";
import { buildClientReport } from "@/lib/reports/clientReport";

// The Client report: a print-ready snapshot of a project to send to a
// client. The figures are built in src/lib/reports/clientReport.ts, shared
// with the MCP get_report tool. Optional ?from=&to= adds a period section;
// ?priorities=CRITICAL,HIGH narrows everything to those priorities.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireProjectAccess(params.id);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const report = await buildClientReport(params.id, { from: sp.get("from"), to: sp.get("to"), priorities: sp.get("priorities") });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
