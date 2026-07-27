import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskCreateSchema, assigneesToConnect } from "@/lib/validation/task";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const tasks = await prisma.task.findMany({
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = taskCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const data = parsed.data;

  // Super Admins can create anywhere (or with no project, as before). Everyone
  // else needs a per-project admin grant on the specific project they're
  // targeting — a project is required in that case, there's no "unscoped"
  // task creation for a Project Admin.
  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(data.projectId && access.administeredProjectIds.includes(data.projectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  try {
    const task = await prisma.task.create({
      data: {
        code: data.code || null,
        title: data.title,
        description: data.description || null,
        projectId: data.projectId || null,
        ...assigneesToConnect(data.assignees),
        priority: data.priority,
        status: data.status,
        startDate: dateStrToUTC(data.startDate),
        dueDate: dateStrToUTC(data.dueDate),
        progress: data.status === "DONE" ? 100 : data.progress,
        isMilestone: data.isMilestone,
        createdById: session.user.id,
        dependsOn: { connect: data.dependsOn.map((id) => ({ id })) },
      },
      include: taskInclude,
    });
    return NextResponse.json(serializeTask(task), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't create task — check the selected project/assignees/dependencies" }, { status: 400 });
  }
}
