import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { importCommitSchema } from "@/lib/validation/import";
import { dateStrToUTC } from "@/lib/serverDates";
import { nextTaskCode } from "@/lib/taskCode";
import { resolveTags } from "@/lib/tags";
import { addComment } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = importCommitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import data" }, { status: 400 });
  }
  const { tasksToAdd, newProjectNames } = parsed.data;
  const createdById = session.user.id;
  const commentsToAdd: { taskId: string; message: string }[] = [];

  try {
    const created = await prisma.$transaction(async (tx) => {
      const projectNameToId = new Map<string, string>();
      for (const name of newProjectNames) {
        const existing = await tx.project.findFirst({ where: { name } });
        if (existing) {
          projectNameToId.set(name, existing.id);
          continue;
        }
        // Derive a task-code prefix from the name; fall back to a numbered
        // suffix on the rare chance it collides with an existing one.
        const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PROJ";
        let code = base;
        let suffix = 1;
        while (await tx.project.findUnique({ where: { code } })) {
          code = `${base}${++suffix}`;
        }
        const project = await tx.project.create({ data: { name, code } });
        projectNameToId.set(name, project.id);
      }

      const tempIdToRealId = new Map<string, string>();
      for (const t of tasksToAdd) {
        const projectId = t.projectId ?? (t.newProjectName ? projectNameToId.get(t.newProjectName) ?? null : null);
        // Auto-number the code from the project's running sequence (same
        // scheme as manual task creation) rather than trusting the sheet's
        // Code column, which only matters here for resolving "Depends On"
        // references between rows (handled separately, by id).
        const code = projectId ? await nextTaskCode(tx, projectId) : t.code || null;
        // Tag upsert isn't part of this transaction (resolveTags uses the
        // shared prisma client), but that's fine — tags have no dependency
        // on the task row, only the connect below does.
        const tagRows = t.tags.length > 0 ? await resolveTags(t.tags) : [];
        const task = await tx.task.create({
          data: {
            code,
            title: t.title,
            description: t.description || null,
            module: t.module || null,
            tags: { connect: tagRows.map((tag) => ({ id: tag.id })) },
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
        if (t.comment.trim()) commentsToAdd.push({ taskId: task.id, message: t.comment.trim() });
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

    // Comments reference the task by foreign key, so they can only be added
    // once the transaction that created those tasks has actually committed.
    for (const c of commentsToAdd) {
      addComment(c.taskId, createdById, c.message).catch((err) => console.error("import addComment failed:", err));
    }

    return NextResponse.json({ created });
  } catch {
    return NextResponse.json({ error: "Import failed — no tasks were created" }, { status: 400 });
  }
}
