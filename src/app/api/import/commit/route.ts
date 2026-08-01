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

    // ---- Parent-task references: another row in this same file, or an
    // existing task already in the DB (see excelImport.ts's "Parent Code"
    // column). ----
    const parentRefByTempId = new Map<string, { existingId?: string; tempId?: string }>();
    for (const t of tasksToAdd) {
      if (t.parentTempId) parentRefByTempId.set(t.tempId, { tempId: t.parentTempId });
      else if (t.parentExistingId) parentRefByTempId.set(t.tempId, { existingId: t.parentExistingId });
    }
    const existingParentIds = [...new Set(tasksToAdd.map((t) => t.parentExistingId).filter((id): id is string => !!id))];
    const existingParents = existingParentIds.length > 0
      ? await prisma.task.findMany({ where: { id: { in: existingParentIds } }, select: { id: true, code: true, projectId: true, childCodeSeq: true } })
      : [];
    const existingParentById = new Map(existingParents.map((p) => [p.id, p]));

    const resolvedProjectId = new Map<string, string | null>();
    for (const t of tasksToAdd) {
      resolvedProjectId.set(t.tempId, t.projectId ?? (t.newProjectName ? projectNameToId.get(t.newProjectName) ?? null : null));
    }
    // A subtask always lives in its parent's project — push that down from
    // parent to child, looping so a multi-level chain within the same file
    // (grandchild -> child -> parent) converges regardless of row order.
    for (let pass = 0; pass < tasksToAdd.length + 5; pass++) {
      let changed = false;
      for (const t of tasksToAdd) {
        const ref = parentRefByTempId.get(t.tempId);
        if (!ref) continue;
        const parentProjectId = ref.existingId
          ? existingParentById.get(ref.existingId)?.projectId ?? null
          : resolvedProjectId.get(ref.tempId!);
        if (parentProjectId !== undefined && resolvedProjectId.get(t.tempId) !== parentProjectId) {
          resolvedProjectId.set(t.tempId, parentProjectId);
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Batch-reserve codes per project — one counter bump per project (not
    // per row). Rows with a resolved parent are excluded here; they get a
    // hierarchical code off their parent's own counter instead, below.
    const rowsByProject = new Map<string, string[]>(); // projectId -> tempIds
    for (const t of tasksToAdd) {
      if (parentRefByTempId.has(t.tempId)) continue;
      const projectId = resolvedProjectId.get(t.tempId);
      if (!projectId) continue;
      if (!rowsByProject.has(projectId)) rowsByProject.set(projectId, []);
      rowsByProject.get(projectId)!.push(t.tempId);
    }
    const codeByTempId = new Map<string, string | null>();
    for (const t of tasksToAdd) {
      if (!resolvedProjectId.get(t.tempId) && !parentRefByTempId.has(t.tempId)) codeByTempId.set(t.tempId, t.code || null);
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

    // Ids are generated up front (rather than left to Prisma's createMany
    // default) so a same-batch parent reference can resolve to a real id
    // before that parent row is actually inserted.
    const idByTempId = new Map(tasksToAdd.map((t) => [t.tempId, randomUUID()]));
    const tempIdByTask = new Map(tasksToAdd.map((t) => [t.tempId, t]));

    // ---- Hierarchical (child) codes: ABC-0001 -> ABC-0001-01, -02, ...
    // Resolved iteratively so a multi-level chain within the same file
    // works regardless of row order — a grandchild just waits until its
    // parent's own code becomes known in an earlier pass. ----
    const parentIdByTempId = new Map<string, string>(); // real id of the resolved parent, once known
    const childCodeSeqDelta = new Map<string, number>(); // real parent id -> how much this import bumps it
    const childCodeSeqStart = new Map<string, number>(existingParents.map((p) => [p.id, p.childCodeSeq]));
    const remainingChildren = new Set(tasksToAdd.filter((t) => parentRefByTempId.has(t.tempId)).map((t) => t.tempId));

    for (let pass = 0; pass < tasksToAdd.length + 5 && remainingChildren.size > 0; pass++) {
      let progressed = false;
      for (const tempId of [...remainingChildren]) {
        const ref = parentRefByTempId.get(tempId)!;
        const parentRealId = ref.existingId ?? (ref.tempId ? idByTempId.get(ref.tempId) : undefined);
        const parentCode = ref.existingId ? existingParentById.get(ref.existingId)?.code ?? null : (ref.tempId ? codeByTempId.get(ref.tempId) ?? null : null);
        if (!parentRealId || !parentCode) continue; // parent not resolved yet — retry next pass
        parentIdByTempId.set(tempId, parentRealId);
        const nextSeq = (childCodeSeqStart.get(parentRealId) ?? 0) + (childCodeSeqDelta.get(parentRealId) ?? 0) + 1;
        childCodeSeqDelta.set(parentRealId, (childCodeSeqDelta.get(parentRealId) ?? 0) + 1);
        const t = tempIdByTask.get(tempId)!;
        codeByTempId.set(tempId, t.code.trim() ? t.code : `${parentCode}-${String(nextSeq).padStart(2, "0")}`);
        remainingChildren.delete(tempId);
        progressed = true;
      }
      if (!progressed) break;
    }
    // Any row whose parent reference never resolved (parent code missing or
    // circular) just falls back to its own given/blank code as a top-level
    // task — preview-time warnings already flagged the unknown code.

    // Existing (already-in-DB) parents' counters bump right away, same as
    // the per-project bump above. Same-batch parents that are new this
    // import get their starting childCodeSeq baked straight into their
    // createMany row below instead (nothing to update yet — they don't exist).
    for (const [parentId, delta] of childCodeSeqDelta) {
      if (existingParentById.has(parentId)) {
        await prisma.task.update({ where: { id: parentId }, data: { childCodeSeq: { increment: delta } } });
      }
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

    const created = await prisma.$transaction(async (tx) => {
      // One bulk insert for every task row — a plain per-row task.create()
      // with nested tags/assignees `connect` measured at ~2s/row through
      // this pooled connection (each relation connect pays its own latency),
      // which doesn't scale to a project with hundreds of tasks. createMany
      // plus raw bulk inserts into the two join tables below is the same
      // end result in 3 round trips total instead of one query per relation.
      await tx.task.createMany({
        data: tasksToAdd.map((t) => {
          const ownRealId = idByTempId.get(t.tempId)!;
          return {
            id: ownRealId,
            code: codeByTempId.get(t.tempId) ?? null,
            title: t.title,
            description: t.description || null,
            module: t.module || null,
            projectId: resolvedProjectId.get(t.tempId) ?? null,
            parentId: parentIdByTempId.get(t.tempId) ?? null,
            // A new-this-import parent's counter starts at however many
            // subtask codes were just handed out under it, so future
            // additions (single-create or a later import) don't collide.
            childCodeSeq: childCodeSeqDelta.get(ownRealId) ?? 0,
            priority: t.priority,
            status: t.status,
            startDate: dateStrToUTC(t.startDate),
            dueDate: dateStrToUTC(t.dueDate),
            progress: t.status === "DONE" ? 100 : t.progress,
            isMilestone: t.isMilestone,
            createdById,
          };
        }),
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
