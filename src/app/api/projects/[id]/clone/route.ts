import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { nextTaskCode } from "@/lib/taskCode";
import { nextChildCode } from "@/lib/taskHierarchy";
import { logAudit } from "@/lib/audit";

// Clones every task in a project into a brand-new one — the "template" use
// case: build the shape once (e.g. Explore/Realize/Deploy/Run phases, or an
// Onboarding program with weekly milestones), then stamp out a fresh copy
// per engagement/hire with dates shifted to a new start date. Deliberately
// does NOT copy assignees, comments, attachments, or time entries — a
// clone is a fresh structural skeleton, not a snapshot of one engagement's
// history. dependsOn links ARE copied (remapped to the new tasks' IDs) so
// a template's sequencing — "Week 2 waits for Week 1" — survives every
// clone. Task codes carry their source suffix onto the new project's
// prefix: source ONBOARD-W1 → new-project-code-W1, preserving the readable
// naming the template author chose. Codes that don't share the source
// project's prefix fall back to the standard auto-numbered scheme.
// Everything starts at status TODO / progress 0.
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
    include: {
      tags: { select: { id: true } },
      checklistItems: { select: { text: true, order: true } },
      dependsOn: { select: { id: true } },
    },
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

    // If the source task code starts with the source project's own prefix
    // ("ONBOARD-W1" for a project coded ONBOARD), swap that prefix out for
    // the new project's — new code "ADEL-W1" carries the author's readable
    // suffix onto the fresh project. Codes that don't fit the pattern fall
    // through to the standard auto-numbered scheme so nothing goes missing.
    const sourcePrefix = `${sourceProject.code}-`;
    function transformCode(oldCode: string): string | null {
      if (oldCode.startsWith(sourcePrefix)) {
        return `${newProject.code}-${oldCode.slice(sourcePrefix.length)}`;
      }
      return null;
    }

    for (const t of ordered) {
      const newParentId = t.parentId ? idMap.get(t.parentId) ?? null : null;
      const transformed = t.code ? transformCode(t.code) : null;
      let code: string | null;
      if (transformed) {
        code = transformed;
      } else if (newParentId) {
        code = await nextChildCode(prisma, newParentId);
      } else {
        code = await nextTaskCode(prisma, newProject.id);
      }

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

    // Second pass: hook up dependsOn on the new tasks by remapping every
    // source-side predecessor id through idMap. Done after the create loop
    // so both sides of each edge already exist. Predecessors that live
    // outside this project (rare, but possible if the template ever
    // referenced a system-wide task) are silently dropped — a clone
    // shouldn't leak references into whatever project the source pointed
    // at last.
    for (const t of ordered) {
      const mappedDeps = t.dependsOn.map((d) => idMap.get(d.id)).filter((id): id is string => !!id);
      if (mappedDeps.length === 0) continue;
      const newId = idMap.get(t.id);
      if (!newId) continue;
      await prisma.task.update({
        where: { id: newId },
        data: { dependsOn: { connect: mappedDeps.map((id) => ({ id })) } },
      });
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
