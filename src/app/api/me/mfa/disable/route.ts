import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Disabling MFA always requires the user's current password — otherwise a
// stolen session could just turn their own protection off.
const bodySchema = z.object({ currentPassword: z.string().min(1) });

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } }),
    prisma.trustedDevice.deleteMany({ where: { userId: user.id } }),
  ]);

  logAudit(user.id, "Disabled two-factor authentication");
  return NextResponse.json({ ok: true });
}
