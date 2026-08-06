import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";

// For every task this user can see, the timestamp of its first real comment
// (not an automatic activity line) — the "first response" half of SLA
// tracking. Resolution uses Task.completedAt, already in the main list.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const access = await getUserAccess(session);
  const taskIds = (
    await prisma.task.findMany({
      where: visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds),
      select: { id: true },
    })
  ).map((t) => t.id);

  const comments = await prisma.taskEvent.findMany({
    where: { taskId: { in: taskIds }, type: "COMMENT" },
    select: { taskId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstCommentAt = new Map<string, string>();
  for (const c of comments) {
    if (!firstCommentAt.has(c.taskId)) firstCommentAt.set(c.taskId, c.createdAt.toISOString());
  }

  return NextResponse.json(Object.fromEntries(firstCommentAt));
}
