import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Runs monthly (see .github/workflows/monthly-rotate-audit-log.yml).
// Removes AuditLog rows older than 1 year — noise beyond that point,
// and it keeps the table from growing indefinitely.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return NextResponse.json({ deleted: result.count, cutoff: cutoff.toISOString() });
}
