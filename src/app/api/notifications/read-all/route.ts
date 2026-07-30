import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";

export async function POST() {
  const { session, error } = await requireSession();
  if (error) return error;

  await prisma.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
