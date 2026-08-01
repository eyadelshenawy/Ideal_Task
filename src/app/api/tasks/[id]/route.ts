import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { taskFullUpdateSchema, taskStatusUpdateSchema, assigneesToSet } from "@/lib/validation/task";
import { serializeTask, taskInclude } from "@/lib/serializers/task";
import { dateStrToUTC } from "@/lib/serverDates";
import { notifyAssignment } from "@/lib/notifications";
import { logActivity, describeTaskChanges, loadNameLookups } from "@/lib/activity";
import { createNextOccurrence } from "@/lib/recurrence";
import { resolveTags } from "@/lib/tags";
import { codeMatchesProject } from "@/lib/taskCode";
import { wouldCreateCycle } from "@/lib/taskDependencies";
import { codeMatchesParent, wouldCreateHierarchyCycle, syncAncestorChain, getDescendantIds } from "@/lib/taskHierarchy";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({
    where: { id: params.id },
    include: { assignees: { select: { id: true } }, contactAssignees: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  const canFullyEdit = access.isSuperAdmin || (existing.projectId !== null && access.administeredProjectIds.includes(existing.projectId));
  const body = await req.json().catch(() => null);

  // Anyone without full-edit rights on this task's current project may only
  // move its status and adjust progress — everything else (title, dates,
  // assignees, priority, project, dependencies, milestone flag) requires
  // Super Admin or a project-admin grant on the task's project.
  if (!canFullyEdit) {
    const parsed = taskStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "You can only update status and progress on this task" }, { status: 403 });
    }
    const data = parsed.data;
    const nextStatus = data.status ?? existing.status;
    try {
      const task = await prisma.task.update({
        where: { id: params.id },
        data: {
          status: nextStatus,
          progress: nextStatus === "DONE" ? 100 : data.progress ?? existing.progress,
        },
        include: taskInclude,
      });
      if (nextStatus === "DONE" && existing.status !== "DONE" && task.recurrenceFreq) {
        createNextOccurrence(task).catch((err) => console.error("createNextOccurrence failed:", err));
      }
      if (nextStatus !== existing.status && task.parentId) {
        await syncAncestorChain(prisma, task.parentId);
      }
      if (nextStatus !== existing.status) {
        const lines = describeTaskChanges(
          { ...existing, assigneeIds: [], contactAssigneeIds: [] },
          { ...existing, status: nextStatus, assigneeIds: [], contactAssigneeIds: [] },
          { userNames: new Map(), contactNames: new Map(), projectNames: new Map() }
        );
        logActivity(task.id, session.user.id, lines.join("\n")).catch((err) => console.error("logActivity failed:", err));
      }
      return NextResponse.json(serializeTask(task));
    } catch {
      return NextResponse.json({ error: "Couldn't update task" }, { status: 400 });
    }
  }

  const parsed = taskFullUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid task" }, { status: 400 });
  }
  const data = parsed.data;
  const nextStatus = data.status ?? existing.status;
  const dependsOn = data.dependsOn?.filter((id) => id !== params.id);

  // A Project-Admin editor (not Super Admin) may only move a task to another
  // project they themselves administer — never to null, never to a project
  // outside their grants. Super Admin is unrestricted.
  if (!access.isSuperAdmin && data.projectId !== undefined && data.projectId !== existing.projectId) {
    if (!data.projectId || !access.administeredProjectIds.includes(data.projectId)) {
      return NextResponse.json({ error: "You can only move this task to a project you administer" }, { status: 403 });
    }
  }

  const finalParentId = data.parentId !== undefined ? data.parentId : existing.parentId;

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === params.id) {
      return NextResponse.json({ error: "A task can't be its own parent" }, { status: 400 });
    }
    if (await wouldCreateHierarchyCycle(prisma, params.id, data.parentId)) {
      return NextResponse.json({ error: "That would create a circular task hierarchy" }, { status: 400 });
    }
  }

  // Moving a task that already has subtasks to a different project would
  // strand them in the old one — block it; move/detach the subtasks first.
  if (data.projectId !== undefined && data.projectId !== existing.projectId) {
    const childCount = await prisma.task.count({ where: { parentId: params.id, deletedAt: null } });
    if (childCount > 0) {
      return NextResponse.json({ error: "This task has subtasks — move or remove them before changing its project" }, { status: 400 });
    }
  }

  // Only re-check the code-vs-project/parent-prefix rule when something
  // relevant is actually changing — an older task that predates this rule
  // shouldn't get blocked from unrelated edits just because its existing
  // code is mismatched.
  if (data.code !== undefined || data.projectId !== undefined || data.parentId !== undefined) {
    const finalCode = (data.code !== undefined ? data.code : existing.code) ?? "";
    const finalProjectId = data.projectId !== undefined ? data.projectId : existing.projectId;
    if (finalParentId) {
      const parent = await prisma.task.findUnique({ where: { id: finalParentId }, select: { code: true, projectId: true, deletedAt: true } });
      if (!parent || parent.deletedAt) {
        return NextResponse.json({ error: "Parent task not found" }, { status: 400 });
      }
      if (!parent.code) {
        return NextResponse.json({ error: "Parent task must have a code before it can have subtasks" }, { status: 400 });
      }
      if (!codeMatchesParent(finalCode, parent.code)) {
        return NextResponse.json({ error: `Code must start with "${parent.code}-" for this subtask` }, { status: 400 });
      }
      if (finalProjectId !== parent.projectId) {
        return NextResponse.json({ error: "A subtask must be in the same project as its parent" }, { status: 400 });
      }
    } else if (finalProjectId) {
      const project = await prisma.project.findUnique({ where: { id: finalProjectId }, select: { code: true } });
      if (project && !codeMatchesProject(finalCode, project.code)) {
        return NextResponse.json({ error: `Code must start with "${project.code}-" for this project` }, { status: 400 });
      }
    }
  }

  if (dependsOn !== undefined && dependsOn.length > 0 && (await wouldCreateCycle(prisma, params.id, dependsOn))) {
    return NextResponse.json({ error: "That would create a circular dependency between tasks" }, { status: 400 });
  }

  // Only re-check date ordering when a relevant date is actually changing —
  // same "don't punish older tasks" reasoning as the code/project check above.
  if (data.startDate !== undefined || data.dueDate !== undefined) {
    const existingStartStr = existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null;
    const existingDueStr = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
    const finalStart = data.startDate !== undefined ? data.startDate : existingStartStr;
    const finalDue = data.dueDate !== undefined ? data.dueDate : existingDueStr;
    if (finalStart && finalDue && finalStart > finalDue) {
      return NextResponse.json({ error: "Start date can't be after Due date" }, { status: 400 });
    }
  }
  if (data.recurrenceEndDate !== undefined || data.dueDate !== undefined) {
    const existingDueStr = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
    const existingRecurrenceEndStr = existing.recurrenceEndDate ? existing.recurrenceEndDate.toISOString().slice(0, 10) : null;
    const finalDue = data.dueDate !== undefined ? data.dueDate : existingDueStr;
    const finalRecurrenceEnd = data.recurrenceEndDate !== undefined ? data.recurrenceEndDate : existingRecurrenceEndStr;
    if (finalRecurrenceEnd && finalDue && finalRecurrenceEnd < finalDue) {
      return NextResponse.json({ error: "Repeat end date can't be before Due date" }, { status: 400 });
    }
  }

  const tags = data.tags !== undefined ? await resolveTags(data.tags) : null;

  try {
    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        ...(data.code !== undefined ? { code: data.code || null } : {}),
        ...(tags !== null ? { tags: { set: tags.map((t) => ({ id: t.id })) } } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.module !== undefined ? { module: data.module || null } : {}),
        ...(data.projectId !== undefined ? { projectId: data.projectId || null } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.assignees !== undefined ? assigneesToSet(data.assignees) : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        status: nextStatus,
        ...(data.startDate !== undefined ? { startDate: dateStrToUTC(data.startDate) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: dateStrToUTC(data.dueDate), dueSoonNotifiedAt: null } : {}),
        progress: nextStatus === "DONE" ? 100 : data.progress ?? existing.progress,
        ...(data.isMilestone !== undefined ? { isMilestone: data.isMilestone } : {}),
        ...(dependsOn !== undefined ? { dependsOn: { set: dependsOn.map((id) => ({ id })) } } : {}),
        ...(data.recurrenceFreq !== undefined ? { recurrenceFreq: data.recurrenceFreq } : {}),
        ...(data.recurrenceEndDate !== undefined ? { recurrenceEndDate: dateStrToUTC(data.recurrenceEndDate) } : {}),
      },
      include: taskInclude,
    });

    if (nextStatus === "DONE" && existing.status !== "DONE" && task.recurrenceFreq) {
      createNextOccurrence(task).catch((err) => console.error("createNextOccurrence failed:", err));
    }

    if (nextStatus !== existing.status || task.parentId !== existing.parentId) {
      if (task.parentId) await syncAncestorChain(prisma, task.parentId);
      if (existing.parentId && existing.parentId !== task.parentId) {
        await syncAncestorChain(prisma, existing.parentId);
      }
    }

    if (data.assignees !== undefined) {
      const existingUserIds = new Set(existing.assignees.map((a) => a.id));
      const newlyAssignedUserIds = data.assignees
        .filter((a) => a.type === "user" && !existingUserIds.has(a.id))
        .map((a) => a.id);
      notifyAssignment(task, newlyAssignedUserIds).catch((err) => console.error("notifyAssignment failed:", err));
    }

    (async () => {
      const beforeSnapshot = {
        title: existing.title, status: existing.status, priority: existing.priority, projectId: existing.projectId,
        dueDate: existing.dueDate, startDate: existing.startDate, isMilestone: existing.isMilestone,
        assigneeIds: existing.assignees.map((a) => a.id), contactAssigneeIds: existing.contactAssignees.map((c) => c.id),
      };
      const afterSnapshot = {
        title: task.title, status: task.status, priority: task.priority, projectId: task.projectId,
        dueDate: task.dueDate, startDate: task.startDate, isMilestone: task.isMilestone,
        assigneeIds: task.assignees.map((a) => a.id), contactAssigneeIds: task.contactAssignees.map((c) => c.id),
      };
      const lookups = await loadNameLookups({
        userIds: [...beforeSnapshot.assigneeIds, ...afterSnapshot.assigneeIds],
        contactIds: [...beforeSnapshot.contactAssigneeIds, ...afterSnapshot.contactAssigneeIds],
        projectIds: [existing.projectId, task.projectId].filter((id): id is string => !!id),
      });
      const lines = describeTaskChanges(beforeSnapshot, afterSnapshot, lookups);
      if (lines.length > 0) await logActivity(task.id, session.user.id, lines.join("\n"));
    })().catch((err) => console.error("activity logging failed:", err));

    return NextResponse.json(serializeTask(task));
  } catch (e) {
    const isDuplicateCode = e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002";
    return NextResponse.json(
      { error: isDuplicateCode ? "That code is already used by another task" : "Couldn't update task — check the selected project/assignees/dependencies" },
      { status: 400 },
    );
  }
}

// Soft-delete: moves the task to Trash instead of removing it outright.
// Any subtasks (at any depth) move to Trash along with it.
// See /api/tasks/[id]/restore to undo, and /api/trash to list/empty.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const existing = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true, parentId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && !(existing.projectId && access.administeredProjectIds.includes(existing.projectId))) {
    return NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 });
  }

  const descendantIds = await getDescendantIds(prisma, params.id);
  await prisma.task.updateMany({
    where: { id: { in: [params.id, ...descendantIds] } },
    data: { deletedAt: new Date() },
  }).catch(() => null);

  if (existing.parentId) {
    await syncAncestorChain(prisma, existing.parentId);
  }
  return NextResponse.json({ ok: true });
}
