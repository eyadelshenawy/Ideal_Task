import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin, getUserAccess } from "@/lib/permissions";

// Trash visibility mirrors delete/restore rights: Super Admin sees every
// trashed task and project; a Project-Admin grant holder sees only trashed
// tasks in the project(s) they administer (and no trashed projects, since
// project deletion is Super-Admin-only).
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && access.administeredProjectIds.length === 0) {
    return NextResponse.json({ error: "You don't have admin rights on any project" }, { status: 403 });
  }

  const taskWhere = access.isSuperAdmin
    ? { deletedAt: { not: null } }
    : { deletedAt: { not: null }, projectId: { in: access.administeredProjectIds } };

  const [trashedTasks, trashedProjects] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      select: { id: true, code: true, title: true, projectId: true, deletedAt: true, project: { select: { name: true } } },
      orderBy: { deletedAt: "desc" },
    }),
    access.isSuperAdmin
      ? prisma.project.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    tasks: trashedTasks.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      deletedAt: t.deletedAt!.toISOString(),
    })),
    projects: trashedProjects.map((p) => ({
      id: p.id,
      name: p.name,
      deletedAt: p.deletedAt!.toISOString(),
    })),
  });
}

// Permanently purges everything currently in Trash. Super Admin only — no
// auto-purge job exists, this is the only way trashed items are ever fully
// removed. Purging a project unassigns (doesn't delete) any tasks still
// pointing at it, via Task.projectId's onDelete: SetNull.
export async function DELETE() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await prisma.$transaction([
    prisma.task.deleteMany({ where: { deletedAt: { not: null } } }),
    prisma.project.deleteMany({ where: { deletedAt: { not: null } } }),
  ]);

  return NextResponse.json({ ok: true });
}
