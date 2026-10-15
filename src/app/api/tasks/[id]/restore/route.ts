import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { getDescendantIds, syncAncestorChain } from "@/lib/taskHierarchy";
import { logAudit } from "@/lib/audit";

// Restore rights mirror delete rights: Super Admin for anything, or a
// Project-Admin grant on the task's project. Any of its subtasks still
// sitting in Trash come back along with it.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true, parentId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(existing.projectId && access.administeredProjectIds.includes(existing.projectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  const descendantIds = await getDescendantIds(prisma, params.id);
  if (descendantIds.length > 0) {
    await prisma.task.updateMany({ where: { id: { in: descendantIds }, deletedAt: { not: null } }, data: { deletedAt: null } });
  }

  const task = await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: null },
    include: taskInclude,
  });

  if (existing.parentId) {
    await syncAncestorChain(prisma, existing.parentId);
  }

  const label = task.code ? `${task.code} — ${task.title}` : task.title;
  const extra = descendantIds.length > 0 ? ` (+ ${descendantIds.length} subtask${descendantIds.length === 1 ? "" : "s"})` : "";
  logAudit(session.user.id, `Restored task "${label}" from Trash${extra}`);

  return NextResponse.json(serializeTask(task));
}
