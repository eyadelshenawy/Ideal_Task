import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import {
  issueTrustedDevice,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_MAX_AGE_SECONDS,
} from "@/lib/trustedDevice";

export async function POST() {
  const { session, error } = await requireSession();
  if (error) return error;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.totpEnabled) {
    return NextResponse.json({ error: "MFA is not enabled on this account." }, { status: 400 });
  }

  // Grab a reasonable label from the UA so the user can tell devices apart
  // in the trusted-list page without typing anything.
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const label = ua.slice(0, 160) || null;

  const raw = await issueTrustedDevice(user.id, label);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRUSTED_DEVICE_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
  return res;
}
