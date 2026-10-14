import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const devices = await prisma.trustedDevice.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, expiresAt: true },
  });
  return NextResponse.json(devices.map((d) => ({
    id: d.id,
    label: d.label,
    createdAt: d.createdAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
  })));
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    // No id: revoke them all (the "sign me out of every other device" button).
    const r = await prisma.trustedDevice.deleteMany({ where: { userId: session.user.id } });
    logAudit(session.user.id, `Revoked all trusted devices (${r.count})`);
    return NextResponse.json({ revoked: r.count });
  }

  const r = await prisma.trustedDevice.deleteMany({ where: { id, userId: session.user.id } });
  if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  logAudit(session.user.id, `Revoked a trusted device`);
  return NextResponse.json({ revoked: r.count });
}
