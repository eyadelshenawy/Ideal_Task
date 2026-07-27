import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { importCommitSchema } from "@/lib/validation/import";
import { dateStrToUTC } from "@/lib/serverDates";

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = importCommitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import data" }, { status: 400 });
  }
  const { tasksToAdd, newProjectNames } = parsed.data;
  const createdById = session.user.id;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const projectNameToId = new Map<string, string>();
      for (const name of newProjectNames) {
        const existing = await tx.project.findFirst({ where: { name } });
        if (existing) {
          projectNameToId.set(name, existing.id);
        } else {
          const project = await tx.project.create({ data: { name } });
          projectNameToId.set(name, project.id);
        }
      }

      const tempIdToRealId = new Map<string, string>();
      for (const t of tasksToAdd) {
        const projectId = t.projectId ?? (t.newProjectName ? projectNameToId.get(t.newProjectName) ?? null : null);
        const task = await tx.task.create({
          data: {
            code: t.code || null,
            title: t.title,
            description: t.description || null,
            projectId,
            assignees: t.assigneeId ? { connect: [{ id: t.assigneeId }] } : undefined,
            priority: t.priority,
            status: t.status,
            startDate: dateStrToUTC(t.startDate),
            dueDate: dateStrToUTC(t.dueDate),
            progress: t.status === "DONE" ? 100 : t.progress,
            isMilestone: t.isMilestone,
            createdById,
          },
        });
        tempIdToRealId.set(t.tempId, task.id);
      }

      for (const t of tasksToAdd) {
        const depIds = [
          ...t.dependsOnTempIds.map((id) => tempIdToRealId.get(id)).filter((id): id is string => !!id),
          ...t.dependsOnExistingIds,
        ];
        const realId = tempIdToRealId.get(t.tempId);
        if (!realId || depIds.length === 0) continue;
        await tx.task.update({
          where: { id: realId },
          data: { dependsOn: { connect: depIds.map((id) => ({ id })) } },
        });
      }

      return tasksToAdd.length;
    }, { timeout: 20000 });

    return NextResponse.json({ created });
  } catch {
    return NextResponse.json({ error: "Import failed — no tasks were created" }, { status: 400 });
  }
}
