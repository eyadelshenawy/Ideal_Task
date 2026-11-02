import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { projectUpdateSchema } from "@/lib/validation/project";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = projectUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project" }, { status: 400 });
  }

  // Setting the next task-code number: refuse it if that number, or any later one
  // the counter would reach, is already taken by a task (Trash included —
  // codes stay reserved until a task is deleted permanently).
  let taskCodeSeq: number | undefined;
  if (parsed.data.nextCodeNumber !== undefined) {
    const current = await prisma.project.findUnique({ where: { id: params.id }, select: { code: true } });
    if (!current) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const prefix = (parsed.data.code ?? current.code).toUpperCase();
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
    const used = await prisma.task.findMany({
      where: { code: { startsWith: `${prefix}-`, mode: "insensitive" } },
      select: { code: true },
    });
    const highest = Math.max(0, ...used.map((t) => Number(t.code?.match(pattern)?.[1] ?? 0)));
    const wanted = parsed.data.nextCodeNumber;
    if (highest >= wanted) {
      const takenCode = `${prefix}-${String(highest).padStart(4, "0")}`;
      return NextResponse.json({
        error: `${takenCode} is already used (it may be in Trash — delete it permanently first). The lowest number you can use is ${highest + 1}.`,
      }, { status: 400 });
    }
    taskCodeSeq = wanted - 1;
  }

  try {
    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
        ...(parsed.data.slaTrackingEnabled !== undefined ? { slaTrackingEnabled: parsed.data.slaTrackingEnabled } : {}),
        ...(parsed.data.slaBusinessHours !== undefined ? { slaBusinessHours: parsed.data.slaBusinessHours } : {}),
        ...(parsed.data.isTemplate !== undefined ? { isTemplate: parsed.data.isTemplate } : {}),
        ...(taskCodeSeq !== undefined ? { taskCodeSeq } : {}),
      },
    });
    logAudit(
      session.user.id,
      taskCodeSeq !== undefined
        ? `Set the next task code of "${project.name}" to ${project.code}-${String(taskCodeSeq + 1).padStart(4, "0")}`
        : `Updated project "${project.name}" (${project.code})`,
    );
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Couldn't update project — code may already be in use" }, { status: 400 });
  }
}

// Soft-delete: moves the project to Trash. Tasks that reference it are left
// untouched — they keep showing it — while it sits in Trash; they're only
// unassigned (Task.projectId's onDelete: SetNull) if it's later purged for
// good via /api/trash. See /api/projects/[id]/restore to undo.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const project = await prisma.project.update({ where: { id: params.id }, data: { deletedAt: new Date() } }).catch(() => null);
  if (project) logAudit(session.user.id, `Moved project "${project.name}" to Trash`);
  return NextResponse.json({ ok: true });
}
