import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Every user reads the config (their client-side date warnings depend on it),
// but only a Super Admin can change which weekdays count as working days.
// Singleton row with a fixed id — created lazily on first PUT so a fresh
// install doesn't need a seed step.

const workWeekSchema = z.object({
  sun: z.boolean(),
  mon: z.boolean(),
  tue: z.boolean(),
  wed: z.boolean(),
  thu: z.boolean(),
  fri: z.boolean(),
  sat: z.boolean(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const row = await prisma.workWeekConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json(
    row ?? { sun: true, mon: true, tue: true, wed: true, thu: true, fri: false, sat: false },
  );
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = workWeekSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid work-week payload" }, { status: 400 });
  }
  const row = await prisma.workWeekConfig.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });
  logAudit(session.user.id, "Updated the org-wide work-week configuration");
  return NextResponse.json(row);
}
