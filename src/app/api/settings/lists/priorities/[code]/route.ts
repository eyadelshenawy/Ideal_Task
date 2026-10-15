import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Priorities are fixed (they drive SLA targets); only the name shown and the
// colour can change.
const patchSchema = z.object({
  label: z.string().trim().min(1, "Name is required").max(30).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colour must look like #0A5A46").optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });

  const existing = await prisma.priorityOption.findUnique({ where: { code } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.label) {
    const clash = await prisma.priorityOption.findFirst({ where: { code: { not: code }, label: { equals: parsed.data.label, mode: "insensitive" } } });
    if (clash) return NextResponse.json({ error: "Another priority already has that name" }, { status: 400 });
  }
  const row = await prisma.priorityOption.update({ where: { code }, data: parsed.data });

  const changes: string[] = [];
  if (parsed.data.label !== undefined && parsed.data.label !== existing.label) changes.push(`renamed to "${parsed.data.label}"`);
  if (parsed.data.color !== undefined && parsed.data.color.toUpperCase() !== existing.color.toUpperCase()) changes.push(`colour ${existing.color} → ${parsed.data.color}`);
  if (changes.length) logAudit(session.user.id, `Priority "${existing.label}": ${changes.join(", ")}`);
  return NextResponse.json(row);
}
