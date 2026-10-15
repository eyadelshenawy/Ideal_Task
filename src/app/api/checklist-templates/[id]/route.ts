import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await prisma.checklistTemplate.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
