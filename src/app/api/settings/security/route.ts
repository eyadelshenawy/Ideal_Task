import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { loadSecurityConfig, saveSecurityConfig } from "@/lib/securityConfig";
import { logAudit } from "@/lib/audit";

// GET is open to any signed-in user: the client needs the idle-timeout
// value to drive its own timers. It's not sensitive — same policy would be
// visible from UI reactions anyway. Writes are Super Admin only.
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const cfg = await loadSecurityConfig();
  return NextResponse.json(cfg);
}

const patchSchema = z.object({
  sessionIdleTimeoutMinutes: z.number().int().min(0).max(240),
  passwordExpiryDays: z.number().int().min(0).max(365),
  passwordMinLength: z.number().int().min(6).max(64),
  passwordRequireUppercase: z.boolean(),
  passwordRequireNumber: z.boolean(),
  passwordRequireSymbol: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const saved = await saveSecurityConfig(parsed.data);
  logAudit(session.user.id, "Updated security policy");
  return NextResponse.json(saved);
}
