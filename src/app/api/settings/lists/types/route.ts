import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bgFor } from "@/lib/lists";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colour must look like #0A5A46");

const createSchema = z.object({
  label: z.string().trim().min(1, "Name is required").max(40),
  short: z.string().trim().min(1, "Short tag is required").max(8),
  color: hex,
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid type" }, { status: 400 });
  const { label, short, color } = parsed.data;

  const code = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "TYPE";
  const clash = await prisma.ticketTypeOption.findFirst({
    where: { OR: [{ code }, { label: { equals: label, mode: "insensitive" } }] },
  });
  if (clash) return NextResponse.json({ error: "A ticket type with that name already exists" }, { status: 400 });

  const max = await prisma.ticketTypeOption.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.ticketTypeOption.create({
    data: { code, label, short, color, bg: bgFor(color), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  logAudit(session.user.id, `Added ticket type "${label}"`);
  return NextResponse.json(row);
}
