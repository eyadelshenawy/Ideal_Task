import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const row = await prisma.holiday.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.holiday.delete({ where: { id: params.id } });
  logAudit(session.user.id, `Removed holiday "${row.name}" (${row.date.toISOString().slice(0, 10)})`);
  return NextResponse.json({ ok: true });
}
