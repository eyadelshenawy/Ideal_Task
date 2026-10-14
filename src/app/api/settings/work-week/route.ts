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
  workStartMinutes: z.number().int().min(0).max(1439),
  workEndMinutes: z.number().int().min(1).max(1440),
  timeZone: z.string().min(1).max(64).refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown time zone"),
}).refine((d) => d.workEndMinutes > d.workStartMinutes, { message: "End time must be after start time" });

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const row = await prisma.workWeekConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json(
    row ?? { sun: true, mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, workStartMinutes: 540, workEndMinutes: 1020, timeZone: "Africa/Cairo" },
  );
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = workWeekSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid work-week payload" }, { status: 400 });
  }
  const row = await prisma.workWeekConfig.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });
  logAudit(session.user.id, "Updated the org-wide work-week configuration");
  return NextResponse.json(row);
}
