import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Generates (or replaces) a project's public ticket-intake token — Super
// Admin only. Separate from shareToken so the status link and the intake
// link can be handed out/revoked independently.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const intakeToken = crypto.randomBytes(24).toString("base64url");
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { intakeToken },
    select: { name: true, code: true, intakeToken: true },
  }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAudit(session.user.id, `Generated a public ticket-submission link for project "${project.name}" (${project.code})`);
  return NextResponse.json({ intakeToken: project.intakeToken });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: { intakeToken: null },
    select: { name: true, code: true },
  }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAudit(session.user.id, `Revoked the public ticket-submission link for project "${project.name}" (${project.code})`);
  return NextResponse.json({ ok: true });
}
