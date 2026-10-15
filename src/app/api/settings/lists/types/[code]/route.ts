import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bgFor } from "@/lib/lists";

const patchSchema = z.object({
  label: z.string().trim().min(1, "Name is required").max(40).optional(),
  short: z.string().trim().min(1, "Short tag is required").max(8).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colour must look like #0A5A46").optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.ticketTypeOption.findUnique({ where: { code } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Task, Incident and Service Request are used by the app itself
  // (default type, customer ticket form), so they can't be hidden.
  if (data.active === false && existing.system) {
    return NextResponse.json({ error: `"${existing.label}" is used by the app and can't be hidden` }, { status: 400 });
  }
  if (data.label && data.label.toLowerCase() !== existing.label.toLowerCase()) {
    const clash = await prisma.ticketTypeOption.findFirst({ where: { code: { not: code }, label: { equals: data.label, mode: "insensitive" } } });
    if (clash) return NextResponse.json({ error: "A ticket type with that name already exists" }, { status: 400 });
  }

  const row = await prisma.ticketTypeOption.update({
    where: { code },
    data: { ...data, ...(data.color ? { bg: bgFor(data.color) } : {}) },
  });

  const changes: string[] = [];
  if (data.label !== undefined && data.label !== existing.label) changes.push(`renamed to "${data.label}"`);
  if (data.short !== undefined && data.short !== existing.short) changes.push(`short tag "${existing.short}" → "${data.short}"`);
  if (data.color !== undefined && data.color.toUpperCase() !== existing.color.toUpperCase()) changes.push(`colour ${existing.color} → ${data.color}`);
  if (data.active !== undefined && data.active !== existing.active) changes.push(data.active ? "shown again" : "hidden");
  if (changes.length) logAudit(session.user.id, `Ticket type "${existing.label}": ${changes.join(", ")}`);
  return NextResponse.json(row);
}
