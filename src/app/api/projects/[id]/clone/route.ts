import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { nextTaskCode } from "@/lib/taskCode";
import { nextChildCode } from "@/lib/taskHierarchy";
import { logAudit } from "@/lib/audit";

// Clones every task in a project into a brand-new one — the "template" use
// case: build the shape once (e.g. Explore/Realize/Deploy/Run phases with
// their subtasks), then stamp out a fresh copy per new client/engagement
// with dates shifted to a new start date. Deliberately does NOT copy
// assignees, comments, attachments, time entries, or dependsOn links — a
// clone is a fresh structural skeleton, not a snapshot of one engagement's
// history. Everything starts at status TODO / progress 0.
const cloneSchema = z.object({
  name: z.string().trim().min(1, "New project name is required"),
  code: z.string().trim().min(1, "New project code is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = cloneSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const sourceProject = await prisma.project.findUnique({ where: { id: params.id } });
  if (!sourceProject || sourceProject.deletedAt) {
    return NextResponse.json({ error: "Source project not found" }, { status: 404 });
  }

  const sourceTasks = await prisma.task.findMany({
    where: { projectId: params.id, deletedAt: null },
    include: { tags: { select: { id: true } }, checklistItems: { select: { text: true, order: true } } },
    orderBy: { createdAt: "asc" },
  });

  // The earliest startDate (falling back to dueDate) across the source
  // project anchors the shift: every task's own dates move by the same
  // number of days relative to that anchor.
  const anchorTime = sourceTasks.reduce<number | null>((min, t) => {
    const d = t.startDate ?? t.dueDate;
    if (!d) return min;
    return min === null || d.getTime() < min ? d.getTime() : min;
  }, null);
  const newAnchor = new Date(`${parsed.data.startDate}T00:00:00.000Z`);

  function shift(d: Date | null): Date | null {
    if (!d || anchorTime === null) return null;
    const deltaDays = Math.round((d.getTime() - anchorTime) / 86400000);
    return new Date(newAnchor.getTime() + deltaDays * 86400000);
  }

  try {
    const newProject = await prisma.project.create({ data: { name: parsed.data.name, code: parsed.data.code } });

    // Roots before children, since a child's Prisma parentId needs the
    // parent's NEW id to already exist — sourceTasks is in creation order,
    // which for a hierarchy built top-down already satisfies that, but sort
    // defensively (root tasks, i.e. no parentId, first).
    const ordered = [...sourceTasks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    const idMap = new Map<string, string>();

    for (const t of ordered) {
      const newParentId = t.parentId ? idMap.get(t.parentId) ?? null : null;
      const code = newParentId
        ? await nextChildCode(prisma, newParentId)
        : await nextTaskCode(prisma, newProject.id);

      const created = await prisma.task.create({
        data: {
          code,
          title: t.title,
          description: t.description,
          module: t.module,
          projectId: newProject.id,
          parentId: newParentId,
          priority: t.priority,
          status: "TODO",
          progress: 0,
          startDate: shift(t.startDate),
          dueDate: shift(t.dueDate),
          isMilestone: t.isMilestone,
          tags: { connect: t.tags.map((tag) => ({ id: tag.id })) },
          checklistItems: { create: t.checklistItems.map((c) => ({ text: c.text, order: c.order })) },
          createdById: session.user.id,
        },
      });
      idMap.set(t.id, created.id);
    }

    logAudit(session.user.id, `Cloned project "${sourceProject.name}" into new project "${newProject.name}" (${newProject.code}), ${ordered.length} tasks`);
    return NextResponse.json({ id: newProject.id, name: newProject.name, code: newProject.code, taskCount: ordered.length }, { status: 201 });
  } catch (e) {
    const isDuplicateCode = e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002";
    return NextResponse.json(
      { error: isDuplicateCode ? "That project code is already in use" : "Couldn't clone the project" },
      { status: 400 },
    );
  }
}
