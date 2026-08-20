import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// Super Admin only. Invalidates the old customer-facing tracking link
// (used when a link has been forwarded/leaked and needs revoking) and
// issues a fresh one. The old token stops resolving immediately.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trackingToken = crypto.randomBytes(9).toString("base64url");
  await prisma.task.update({ where: { id: task.id }, data: { trackingToken } });

  await logActivity(task.id, session.user.id, "Reset the customer tracking link").catch(() => {});

  return NextResponse.json({ trackingToken });
}
