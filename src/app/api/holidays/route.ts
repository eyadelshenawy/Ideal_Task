import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { dateStrToUTC } from "@/lib/serverDates";
import { logAudit } from "@/lib/audit";

// Any signed-in user reads the list (their client-side date warnings need to
// name the holiday for a chosen date). Only a Super Admin can add or remove
// entries. A holiday is one calendar day; recurring/rolling entries are
// deliberately not modelled — Eid dates shift year to year and are easier to
// list explicitly than to compute.
const holidayCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const rows = await prisma.holiday.findMany({ orderBy: { date: "asc" }, select: { id: true, name: true, date: true } });
  return NextResponse.json(
    rows.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().slice(0, 10) })),
  );
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = holidayCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid holiday" }, { status: 400 });
  }
  try {
    const dateUtc = dateStrToUTC(parsed.data.date);
    if (!dateUtc) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const h = await prisma.holiday.create({
      data: { name: parsed.data.name, date: dateUtc, createdById: session.user.id },
    });
    logAudit(session.user.id, `Added holiday "${h.name}" (${parsed.data.date})`);
    return NextResponse.json({ id: h.id, name: h.name, date: parsed.data.date }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A holiday for that date already exists" }, { status: 400 });
  }
}
