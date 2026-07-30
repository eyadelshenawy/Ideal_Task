import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { projectUpdateSchema } from "@/lib/validation/project";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = projectUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project" }, { status: 400 });
  }

  try {
    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
      },
    });
    logAudit(session.user.id, `Updated project "${project.name}" (${project.code})`);
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Couldn't update project — code may already be in use" }, { status: 400 });
  }
}

// Soft-delete: moves the project to Trash. Tasks that reference it are left
// untouched — they keep showing it — while it sits in Trash; they're only
// unassigned (Task.projectId's onDelete: SetNull) if it's later purged for
// good via /api/trash. See /api/projects/[id]/restore to undo.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const project = await prisma.project.update({ where: { id: params.id }, data: { deletedAt: new Date() } }).catch(() => null);
  if (project) logAudit(session.user.id, `Moved project "${project.name}" to Trash`);
  return NextResponse.json({ ok: true });
}
