import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getR2DownloadUrl } from "@/lib/r2";

// Public, unauthenticated — same token gate as the project-level share
// endpoint. Deliberately shown here (unlike the summary list): full
// description, every comment, and downloadable attachments — a task
// belongs to the client, so unlike the rest of the app's privacy defaults,
// they get to see everything written on it. Still never reveals *who* on
// the team wrote what — comments/attachments are attributed to "Team" only.
export async function GET(_req: Request, { params }: { params: { token: string; taskId: string } }) {
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { id: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      id: true, projectId: true, deletedAt: true,
      code: true, title: true, description: true, status: true, dueDate: true, progress: true, isMilestone: true,
      events: { where: { type: "COMMENT" }, orderBy: { createdAt: "asc" }, select: { message: true, createdAt: true } },
      attachments: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, fileKey: true, fileSize: true, createdAt: true } },
    },
  });
  // Deliberately 404 (not 403) whether the task doesn't exist, is deleted,
  // or just belongs to a different project — never confirm a task id's
  // existence to someone who only has this project's link.
  if (!task || task.deletedAt || task.projectId !== project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachments = await Promise.all(
    task.attachments.map(async (a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      createdAt: a.createdAt.toISOString(),
      url: await getR2DownloadUrl(a.fileKey, a.fileName).catch(() => null),
    }))
  );

  return NextResponse.json({
    code: task.code,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    isMilestone: task.isMilestone,
    comments: task.events.map((e) => ({ message: e.message, createdAt: e.createdAt.toISOString() })),
    attachments: attachments.filter((a) => a.url !== null),
  });
}
