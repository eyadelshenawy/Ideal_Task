import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — the token itself is the only gate. Deliberately
// exposes a minimal slice of a project: no descriptions, no assignee names,
// no comments/attachments, no internal notes. Private personal tasks can
// never appear here since they're never attached to a project.
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
    select: { code: true, title: true, status: true, dueDate: true, progress: true, isMilestone: true },
    orderBy: { dueDate: "asc" },
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;

  return NextResponse.json({
    projectName: project.name,
    projectCode: project.code,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    tasks: tasks.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      progress: t.progress,
      isMilestone: t.isMilestone,
    })),
  });
}
