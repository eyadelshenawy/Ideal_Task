import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { personalTaskCreateSchema } from "@/lib/validation/task";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";

// Private personal tasks — visible only to their own creator, never through
// the shared task list, reports, exports, or reminders (see
// src/lib/taskVisibility.ts and every other prisma.task.findMany call site
// this feature touches). Always projectId: null, always a single assignee
// (the creator themselves).
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, isPrivate: true, createdById: session.user.id },
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = personalTaskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const data = parsed.data;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      isPrivate: true,
      projectId: null,
      assignees: { connect: [{ id: session.user.id }] },
      priority: data.priority,
      status: data.status,
      startDate: dateStrToUTC(data.startDate),
      dueDate: dateStrToUTC(data.dueDate),
      completedAt: data.status === "DONE" ? new Date() : null,
      progress: data.status === "DONE" ? 100 : data.progress,
      createdById: session.user.id,
    },
    include: taskInclude,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}
