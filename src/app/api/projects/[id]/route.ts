import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { projectUpdateSchema } from "@/lib/validation/project";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = projectUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project" }, { status: 400 });
  }

  try {
    const project = await prisma.project.update({ where: { id: params.id }, data: { name: parsed.data.name } });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Couldn't update project" }, { status: 400 });
  }
}

// Deleting a project unassigns it from any tasks that used it (Task.projectId
// has onDelete: SetNull) — those tasks are kept, matching the prototype.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  await prisma.project.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
