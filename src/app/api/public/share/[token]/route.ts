import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — the token itself is the only gate. This list
// stays a summary (no descriptions/comments) — clicking a task fetches its
// full detail from the sibling [taskId] route, which does include those.
// No internal team member names ever appear at either level. Private
// personal tasks can never appear here since they're never attached to a
// project.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { name: true, code: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { project: { shareToken: params.token }, deletedAt: null },
    select: { id: true, code: true, title: true, status: true, dueDate: true, progress: true, isMilestone: true },
    orderBy: { dueDate: "asc" },
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;

  return NextResponse.json({
    projectName: project.name,
    projectCode: project.code,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    tasks: tasks.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      progress: t.progress,
      isMilestone: t.isMilestone,
    })),
  });
}
