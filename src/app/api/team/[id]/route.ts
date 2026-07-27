import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { teamUpdateSchema } from "@/lib/validation/team";
import { generateTempPassword } from "@/lib/tempPassword";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = teamUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;
  const isSelf = params.id === session.user.id;

  // Server-side guard, independent of the disabled buttons in the UI: a super
  // admin can't demote or deactivate their own account (would risk locking
  // everyone out).
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
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: params.id },
        data: updateData,
        select: { id: true, name: true, email: true, role: true, active: true },
      });

      if (data.projectAdminIds !== undefined) {
        const existing = await tx.projectAdmin.findMany({
          where: { userId: params.id },
          select: { projectId: true },
        });
        const existingIds = new Set(existing.map((g) => g.projectId));
        const nextIds = new Set(data.projectAdminIds);

        const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
        const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

        if (toRemove.length) {
          await tx.projectAdmin.deleteMany({ where: { userId: params.id, projectId: { in: toRemove } } });
        }
        if (toAdd.length) {
          await tx.projectAdmin.createMany({
            data: toAdd.map((projectId) => ({ userId: params.id, projectId })),
          });
        }
      }

      const grants = await tx.projectAdmin.findMany({ where: { userId: params.id }, select: { projectId: true } });
      return { ...updated, projectAdminOf: grants.map((g) => g.projectId) };
    });

    return NextResponse.json({ user, tempPassword });
  } catch {
    return NextResponse.json({ error: "Couldn't update member" }, { status: 400 });
  }
}

// Permanently deletes a user account. Tasks they created keep their record
// (createdById just goes null — see Task.createdBy onDelete: SetNull);
// tasks assigned to them become unassigned the same way.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  if (params.id === session.user.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete member" }, { status: 400 });
  }
}
