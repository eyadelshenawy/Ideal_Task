import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";

export async function PATCH(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSession();
  if (error) return error;

  const notification = await prisma.notification.findUnique({ where: { id: params.id } });
  if (!notification || notification.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.notification.update({ where: { id: params.id }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
