import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { generateTotpSecret, totpQrDataUrl, verifyTotpCode } from "@/lib/totp";

// GET: start enrolment — mint a secret (not yet persisted as enabled) and
// return it with a QR code image for the user to scan. The caller is
// expected to POST a 6-digit code back to confirm the scan worked.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled && user.totpSecret) {
    return NextResponse.json({ alreadyEnabled: true });
  }

  // Reuse any secret we handed out but never confirmed, so the user can
  // refresh the setup page without losing the QR they already scanned.
  const secret = user.totpSecret ?? generateTotpSecret();
  if (!user.totpSecret) {
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }

  const qr = await totpQrDataUrl(secret, user.email);
  return NextResponse.json({ secret, qr, alreadyEnabled: false });
}

const confirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.totpSecret) {
    return NextResponse.json({ error: "No pending enrolment. Start setup again." }, { status: 400 });
  }

  if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
    return NextResponse.json({ error: "The code didn't match. Try again." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  logAudit(user.id, "Enabled two-factor authentication");

  return NextResponse.json({ ok: true });
}
