import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { importCommitSchema } from "@/lib/validation/import";
import { dateStrToUTC } from "@/lib/serverDates";
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
    // New projects are created first, outside the main transaction — there
    // are normally very few of these, and the main loop below needs their
    // ids to know which project each row's code counter belongs to.
    const projectNameToId = new Map<string, string>();
    for (const name of newProjectNames) {
      const existing = await prisma.project.findFirst({ where: { name } });
      if (existing) {
        projectNameToId.set(name, existing.id);
        continue;
      }
      const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PROJ";
      let code = base;
      let suffix = 1;
      while (await prisma.project.findUnique({ where: { code } })) {
        code = `${base}${++suffix}`;
      }
      const project = await prisma.project.create({ data: { name, code } });
      projectNameToId.set(name, project.id);
    }

    const resolvedProjectId = new Map<string, string | null>();
    for (const t of tasksToAdd) {
      resolvedProjectId.set(t.tempId, t.projectId ?? (t.newProjectName ? projectNameToId.get(t.newProjectName) ?? null : null));
    }

    // Batch-reserve codes per project — one counter bump per project (not
    // per row).
    const rowsByProject = new Map<string, string[]>(); // projectId -> tempIds
    for (const t of tasksToAdd) {
      const projectId = resolvedProjectId.get(t.tempId);
      if (!projectId) continue;
      if (!rowsByProject.has(projectId)) rowsByProject.set(projectId, []);
      rowsByProject.get(projectId)!.push(t.tempId);
    }
    const codeByTempId = new Map<string, string | null>();
    for (const t of tasksToAdd) {
      if (!resolvedProjectId.get(t.tempId)) codeByTempId.set(t.tempId, t.code || null);
    }
    for (const [projectId, tempIds] of rowsByProject) {
      const project = await prisma.project.update({
        where: { id: projectId },
        data: { taskCodeSeq: { increment: tempIds.length } },
        select: { code: true, taskCodeSeq: true },
      });
      const endSeq = project.taskCodeSeq;
      const startSeq = endSeq - tempIds.length + 1;
      tempIds.forEach((tempId, i) => {
        codeByTempId.set(tempId, `${project.code}-${String(startSeq + i).padStart(4, "0")}`);
      });
    }

    // Same reasoning for tags: resolve every unique name (including the
    // "legacy-<old code>" ones, now that we know the fresh codes above) in
    // one batch up front, rather than per row.
    const tagNamesByTempId = new Map<string, string[]>();
    const allTagNames = new Set<string>();
    for (const t of tasksToAdd) {
      const names = [...t.tags];
      const freshCode = codeByTempId.get(t.tempId);
      if (t.code.trim() && t.code.trim() !== freshCode) names.push(`legacy-${t.code.trim()}`);
      tagNamesByTempId.set(t.tempId, names);
      names.forEach((n) => allTagNames.add(n));
    }
    const resolvedTags = allTagNames.size > 0 ? await resolveTags([...allTagNames]) : [];
    const tagIdByName = new Map(resolvedTags.map((tag) => [tag.name, tag.id]));

    // Ids are generated up front (rather than left to Prisma's createMany
    // default) so the join-table rows below can be built without a
    // round trip to find out what was just inserted.
    const idByTempId = new Map(tasksToAdd.map((t) => [t.tempId, randomUUID()]));

    const created = await prisma.$transaction(async (tx) => {
      // One bulk insert for every task row — a plain per-row task.create()
      // with nested tags/assignees `connect` measured at ~2s/row through
      // this pooled connection (each relation connect pays its own latency),
      // which doesn't scale to a project with hundreds of tasks. createMany
      // plus raw bulk inserts into the two join tables below is the same
      // end result in 3 round trips total instead of one query per relation.
      await tx.task.createMany({
        data: tasksToAdd.map((t) => ({
          id: idByTempId.get(t.tempId),
          code: codeByTempId.get(t.tempId) ?? null,
          title: t.title,
          description: t.description || null,
          module: t.module || null,
          projectId: resolvedProjectId.get(t.tempId) ?? null,
          priority: t.priority,
          status: t.status,
          startDate: dateStrToUTC(t.startDate),
          dueDate: dateStrToUTC(t.dueDate),
          progress: t.status === "DONE" ? 100 : t.progress,
          isMilestone: t.isMilestone,
          createdById,
        })),
      });

      const tagLinks: { tagId: string; taskId: string }[] = [];
      const assigneeLinks: { taskId: string; userId: string }[] = [];
      for (const t of tasksToAdd) {
        const taskId = idByTempId.get(t.tempId)!;
        const tagIds = (tagNamesByTempId.get(t.tempId) ?? []).map((n) => tagIdByName.get(n)).filter((id): id is string => !!id);
        tagIds.forEach((tagId) => tagLinks.push({ tagId, taskId }));
        if (t.assigneeId) assigneeLinks.push({ taskId, userId: t.assigneeId });
      }
      // Implicit m2m join tables: Prisma names columns A/B alphabetically by
      // model name — "_TaskTags" is (A: Tag.id, B: Task.id), "_TaskAssignees"
      // is (A: Task.id, B: User.id).
      if (tagLinks.length > 0) {
        await tx.$executeRaw`INSERT INTO "_TaskTags" ("A", "B") VALUES ${Prisma.join(
          tagLinks.map((l) => Prisma.sql`(${l.tagId}, ${l.taskId})`)
        )}`;
      }
      if (assigneeLinks.length > 0) {
        await tx.$executeRaw`INSERT INTO "_TaskAssignees" ("A", "B") VALUES ${Prisma.join(
          assigneeLinks.map((l) => Prisma.sql`(${l.taskId}, ${l.userId})`)
        )}`;
      }

      // Dependencies are rare in practice (most imports don't reference
      // other rows), so the per-row connect here is fine as-is.
      for (const t of tasksToAdd) {
        const depIds = [
          ...t.dependsOnTempIds.map((id) => idByTempId.get(id)).filter((id): id is NonNullable<typeof id> => !!id),
          ...t.dependsOnExistingIds,
        ];
        const realId = idByTempId.get(t.tempId);
        if (!realId || depIds.length === 0) continue;
        await tx.task.update({
          where: { id: realId },
          data: { dependsOn: { connect: depIds.map((id) => ({ id })) } },
        });
      }

      for (const t of tasksToAdd) {
        if (t.comment.trim()) commentsToAdd.push({ taskId: idByTempId.get(t.tempId)!, message: t.comment.trim() });
      }

      return tasksToAdd.length;
    }, { timeout: 300000, maxWait: 15000 });

    // Comments reference the task by foreign key, so they can only be added
    // once the transaction that created those tasks has actually committed.
    for (const c of commentsToAdd) {
      addComment(c.taskId, createdById, c.message).catch((err) => console.error("import addComment failed:", err));
    }

    return NextResponse.json({ created });
  } catch (e) {
    console.error("Import commit failed:", e);
    return NextResponse.json({ error: "Import failed — no tasks were created" }, { status: 400 });
  }
}
