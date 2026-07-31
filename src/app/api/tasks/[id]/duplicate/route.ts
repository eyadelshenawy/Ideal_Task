import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { nextTaskCode } from "@/lib/taskCode";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ projectId: z.string().min(1).optional() });

// Duplicates a task into the same project, or a different one if `projectId`
// is given. Resets status/progress to a fresh start; drops comments,
// activity, checklist, dependencies, and recurrence (a copy is a new task,
// not a clone of its history).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const original = await prisma.task.findUnique({
    where: { id: params.id },
    include: { assignees: { select: { id: true } }, contactAssignees: { select: { id: true } }, tags: { select: { id: true } } },
  });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targetProjectId = parsed.data.projectId ?? original.projectId;
  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(targetProjectId && access.administeredProjectIds.includes(targetProjectId))) {
    return NextResponse.json({ error: "You don't have admin rights on the target project" }, { status: 403 });
  }

  const code = targetProjectId ? await nextTaskCode(prisma, targetProjectId) : null;

  const copy = await prisma.task.create({
    data: {
      code,
      title: `${original.title} (Copy)`,
      description: original.description,
      module: original.module,
      projectId: targetProjectId,
      assignees: { connect: original.assignees.map((a) => ({ id: a.id })) },
      contactAssignees: { connect: original.contactAssignees.map((c) => ({ id: c.id })) },
      tags: { connect: original.tags.map((t) => ({ id: t.id })) },
      priority: original.priority,
      status: "TODO",
      progress: 0,
      startDate: original.startDate,
      dueDate: original.dueDate,
      isMilestone: original.isMilestone,
      createdById: session.user.id,
    },
    include: taskInclude,
  });

  logActivity(copy.id, session.user.id, `Duplicated from "${original.title}"`).catch((err) => console.error("logActivity failed:", err));

  return NextResponse.json(serializeTask(copy), { status: 201 });
}
