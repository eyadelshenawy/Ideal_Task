import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { teamCreateSchema } from "@/lib/validation/team";
import { generateTempPassword } from "@/lib/tempPassword";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      projectAdminOf: { select: { projectId: true } },
    },
  });
  return NextResponse.json(
    users.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, active: u.active,
      projectAdminOf: u.projectAdminOf.map((g) => g.projectId),
    })),
  );
}

// Super-Admin-only: creates a member with a generated temp password (returned
// once in the response so the admin can hand it to the new member — no email
// service).
export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = teamCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid member" }, { status: 400 });
  }
  const { name, role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, active: true, mustChangePassword: true },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json({ user: { ...user, projectAdminOf: [] }, tempPassword }, { status: 201 });
}
