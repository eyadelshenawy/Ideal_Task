import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskCreateSchema, assigneesToConnect } from "@/lib/validation/task";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";
import { notifyAssignment } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";
import { createNextOccurrence } from "@/lib/recurrence";
import { resolveTags } from "@/lib/tags";
import { visibleTasksWhere } from "@/lib/taskVisibility";
import { codeMatchesProject } from "@/lib/taskCode";
import { codeMatchesParent, syncAncestorChain } from "@/lib/taskHierarchy";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const access = await getUserAccess(session);
  const tasks = await prisma.task.findMany({
    where: visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds),
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

  // A subtask always lives in its parent's project — the parent decides,
  // whatever projectId the client sent is overridden below.
  let finalProjectId: string | null = data.projectId;
  if (data.parentId) {
    const parent = await prisma.task.findUnique({ where: { id: data.parentId }, select: { code: true, projectId: true, deletedAt: true } });
    if (!parent || parent.deletedAt) {
      return NextResponse.json({ error: "Parent task not found" }, { status: 400 });
    }
    if (!parent.code) {
      return NextResponse.json({ error: "Parent task must have a code before it can have subtasks" }, { status: 400 });
    }
    if (!codeMatchesParent(data.code, parent.code)) {
      return NextResponse.json({ error: `Code must start with "${parent.code}-" for this subtask` }, { status: 400 });
    }
    finalProjectId = parent.projectId;
  }

  // Super Admins can create anywhere (or with no project, as before). Everyone
  // else needs a per-project admin grant on the specific project they're
  // targeting — a project is required in that case, there's no "unscoped"
  // task creation for a Project Admin.
  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(finalProjectId && access.administeredProjectIds.includes(finalProjectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  if (finalProjectId && !data.parentId) {
    const project = await prisma.project.findUnique({ where: { id: finalProjectId }, select: { code: true } });
    if (project && !codeMatchesProject(data.code, project.code)) {
      return NextResponse.json({ error: `Code must start with "${project.code}-" for this project` }, { status: 400 });
    }
  }

  const tags = await resolveTags(data.tags);

  try {
    const task = await prisma.task.create({
      data: {
        code: data.code || null,
        title: data.title,
        description: data.description || null,
        module: data.module || null,
        projectId: finalProjectId || null,
        parentId: data.parentId || null,
        ...assigneesToConnect(data.assignees),
        tags: { connect: tags.map((t) => ({ id: t.id })) },
        priority: data.priority,
        status: data.status,
        startDate: dateStrToUTC(data.startDate),
        dueDate: dateStrToUTC(data.dueDate),
        completedAt: data.completedAt ? dateStrToUTC(data.completedAt) : data.status === "DONE" ? new Date() : null,
        progress: data.status === "DONE" ? 100 : data.progress,
        isMilestone: data.isMilestone,
        recurrenceFreq: data.recurrenceFreq,
        recurrenceEndDate: dateStrToUTC(data.recurrenceEndDate),
        createdById: session.user.id,
        dependsOn: { connect: data.dependsOn.map((id) => ({ id })) },
      },
      include: taskInclude,
    });

    const newAssigneeUserIds = data.assignees.filter((a) => a.type === "user").map((a) => a.id);
    notifyAssignment(task, newAssigneeUserIds).catch((err) => console.error("notifyAssignment failed:", err));
    logActivity(task.id, session.user.id, "Created this task").catch((err) => console.error("logActivity failed:", err));
    if (task.parentId) {
      prisma.task.update({ where: { id: task.parentId }, data: { childCodeSeq: { increment: 1 } } }).catch((err) => console.error("childCodeSeq bump failed:", err));
      // Awaited (unlike the fire-and-forget calls around it): this changes
      // OTHER tasks' visible status, so the response the client acts on next
      // needs to already reflect it, not catch up on some later refetch.
      await syncAncestorChain(prisma, task.parentId);
    } else if (task.projectId) {
      prisma.project.update({ where: { id: task.projectId }, data: { taskCodeSeq: { increment: 1 } } }).catch((err) => console.error("taskCodeSeq bump failed:", err));
    }
    if (task.status === "DONE" && task.recurrenceFreq) {
      createNextOccurrence(task).catch((err) => console.error("createNextOccurrence failed:", err));
    }

    return NextResponse.json(serializeTask(task), { status: 201 });
  } catch (e) {
    const isDuplicateCode = e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002";
    return NextResponse.json(
      { error: isDuplicateCode ? "That code is already used by another task" : "Couldn't create task — check the selected project/assignees/dependencies" },
      { status: 400 },
    );
  }
}
