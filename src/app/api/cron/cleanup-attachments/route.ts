import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, r2Configured } from "@/lib/r2";

// Runs monthly (see .github/workflows/monthly-cleanup-attachments.yml).
// Removes R2 objects + Attachment rows tied to tasks that have been
// soft-deleted for more than 30 days — long enough that anyone who was
// going to restore the task already did.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 is not configured" }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const stale = await prisma.attachment.findMany({
    where: { task: { deletedAt: { lt: cutoff } } },
    select: { id: true, fileKey: true },
  });

  let deleted = 0;
  const failed: string[] = [];
  for (const a of stale) {
    try {
      await deleteFromR2(a.fileKey);
      await prisma.attachment.delete({ where: { id: a.id } });
      deleted++;
    } catch (err) {
      console.error(`cleanup failed for attachment ${a.id}:`, err);
      failed.push(a.id);
    }
  }

  return NextResponse.json({ candidates: stale.length, deleted, failed: failed.length });
}
