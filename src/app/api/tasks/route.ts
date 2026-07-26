import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/permissions";
import { taskCreateSchema } from "@/lib/validation/task";
import { serializeTask } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const tasks = await prisma.task.findMany({
    include: { dependsOn: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = taskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const task = await prisma.task.create({
      data: {
        code: data.code || null,
        title: data.title,
        description: data.description || null,
        projectId: data.projectId || null,
        assigneeId: data.assigneeId || null,
        priority: data.priority,
        status: data.status,
        startDate: dateStrToUTC(data.startDate),
        dueDate: dateStrToUTC(data.dueDate),
        progress: data.status === "DONE" ? 100 : data.progress,
        isMilestone: data.isMilestone,
        createdById: session.user.id,
        dependsOn: { connect: data.dependsOn.map((id) => ({ id })) },
      },
      include: { dependsOn: { select: { id: true } } },
    });
    return NextResponse.json(serializeTask(task), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't create task — check the selected project/assignee/dependencies" }, { status: 400 });
  }
}
