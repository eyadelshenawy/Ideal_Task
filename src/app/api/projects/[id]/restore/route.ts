import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Restoring a project is Super-Admin-only, same as deleting it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const project = await prisma.project.update({ where: { id: params.id }, data: { deletedAt: null } }).catch(() => null);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  logAudit(session.user.id, `Restored project "${project.name}" from Trash`);
  return NextResponse.json(project);
}
