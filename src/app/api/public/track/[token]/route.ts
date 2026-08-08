import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — the token is the only gate. Deliberately
// minimal: status of one ticket, nothing about the rest of the project,
// no comments/attachments/assignee names.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: {
      code: true, title: true, status: true, dueDate: true, progress: true, deletedAt: true,
      project: { select: { name: true } },
    },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  return NextResponse.json({
    code: task.code,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    projectName: task.project?.name ?? null,
  });
}
