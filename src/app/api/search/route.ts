import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";

const LIMIT = 8;

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ tasks: [], comments: [], attachments: [] });
  }

  const access = await getUserAccess(session);
  const taskScope = visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds);

  const [tasks, comments, attachments] = await Promise.all([
    prisma.task.findMany({
      where: {
        AND: [
          taskScope,
          { OR: [
            { title: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ] },
        ],
      },
      select: { id: true, code: true, title: true, status: true },
      take: LIMIT,
    }),
    prisma.taskEvent.findMany({
      where: {
        type: "COMMENT",
        message: { contains: q, mode: "insensitive" },
        task: taskScope,
      },
      select: { id: true, message: true, task: { select: { id: true, code: true, title: true } } },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.attachment.findMany({
      where: {
        fileName: { contains: q, mode: "insensitive" },
        task: taskScope,
      },
      select: { id: true, fileName: true, task: { select: { id: true, code: true, title: true } } },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    tasks,
    comments: comments.map((c) => ({ id: c.id, message: c.message, taskId: c.task.id, taskCode: c.task.code, taskTitle: c.task.title })),
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, taskId: a.task.id, taskCode: a.task.code, taskTitle: a.task.title })),
  });
}
