import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Generates (or replaces) a project's public share token — Super Admin only.
// Replacing immediately invalidates any previously-issued link.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  // Shorter than before, to match the ticket-submission link — this one is
  // handed to clients and admins by hand, not just copy-pasted. Still ~72
  // bits of entropy.
  const shareToken = crypto.randomBytes(9).toString("base64url");
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { shareToken },
    select: { name: true, code: true, shareToken: true },
  }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAudit(session.user.id, `Generated a public share link for project "${project.name}" (${project.code})`);
  return NextResponse.json({ shareToken: project.shareToken });
}

// Revokes the share link — Super Admin only.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: { shareToken: null },
    select: { name: true, code: true },
  }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAudit(session.user.id, `Revoked the public share link for project "${project.name}" (${project.code})`);
  return NextResponse.json({ ok: true });
}
