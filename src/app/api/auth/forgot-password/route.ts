import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().email() });

const RESET_TOKEN_HOURS = 1;
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// Always responds the same way whether or not the email exists — otherwise
// this endpoint would let anyone enumerate which emails have accounts.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
  if (user && user.active) {
    const rawToken = randomBytes(32).toString("hex");
    const resetTokenHash = createHash("sha256").update(rawToken).digest("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash, resetTokenExpires: new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000) },
    });

    const link = `${APP_URL}/reset-password?token=${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your IDEAL Tasks password",
      html: `
        <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color:#111;">Reset your password</h2>
          <p style="font-size:14px; color:#444;">Someone requested a password reset for your IDEAL Tasks account. If this was you, click below — this link expires in ${RESET_TOKEN_HOURS} hour.</p>
          <p style="margin-top:20px;"><a href="${link}" style="background:#0A5A46;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Reset password</a></p>
          <p style="font-size:12px; color:#888; margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
