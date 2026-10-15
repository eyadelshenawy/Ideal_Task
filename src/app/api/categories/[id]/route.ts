import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const renameSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(60) });

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = renameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });

  const existing = await prisma.category.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clash = await prisma.category.findFirst({
    where: { parentId: existing.parentId, id: { not: params.id }, name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (clash) return NextResponse.json({ error: "That name already exists here" }, { status: 400 });

  const row = await prisma.category.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });
  logAudit(session.user.id, `Renamed category "${existing.name}" to "${row.name}"`);
  return NextResponse.json(row);
}

// Tickets using a deleted category keep everything else; their category
// (and subcategory) just becomes empty. Deleting a parent removes its
// subcategories too.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const existing = await prisma.category.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.category.delete({ where: { id: params.id } });
  logAudit(session.user.id, `Deleted ${existing.parentId ? "subcategory" : "category"} "${existing.name}"`);
  return NextResponse.json({ ok: true });
}
