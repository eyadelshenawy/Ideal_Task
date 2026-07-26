import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { teamUpdateSchema } from "@/lib/validation/team";
import { generateTempPassword } from "@/lib/tempPassword";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = teamUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;
  const isSelf = params.id === session.user.id;

  // Server-side guard, independent of the disabled buttons in the UI: an admin
  // can't demote or deactivate their own account (would risk locking everyone out).
  if (isSelf && (data.active === false || data.role === "MEMBER")) {
    return NextResponse.json({ error: "You can't change your own admin access or deactivate yourself" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.active !== undefined) updateData.active = data.active;
  if (data.role !== undefined) updateData.role = data.role;

  let tempPassword: string | undefined;
  if (data.resetPassword) {
    tempPassword = generateTempPassword();
    updateData.passwordHash = await bcrypt.hash(tempPassword, 10);
    updateData.mustChangePassword = true;
  }

  try {
    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return NextResponse.json({ user, tempPassword });
  } catch {
    return NextResponse.json({ error: "Couldn't update member" }, { status: 400 });
  }
}
