import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { nextTaskCode } from "@/lib/taskCode";
import { nextChildCode } from "@/lib/taskHierarchy";
import { logAudit } from "@/lib/audit";
import { addWorkingDays, countWorkingDaysInclusive, loadSchedulingCalendar, toDateOnly } from "@/lib/scheduling";

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
  // project anchors the shift. Every task's own start shifts by the same
  // number of WORKING days from that anchor to the caller's new startDate,
  // then its due is recomputed from that shifted start + its stored
  // durationDays (also working-days). This makes the clone honor the org's
  // work-week and holidays automatically — cloning onto a Sunday during an
  // Eid week no longer strands a task's due on a non-working day.
  const anchorTime = sourceTasks.reduce<number | null>((min, t) => {
    const d = t.startDate ?? t.dueDate;
    if (!d) return min;
    return min === null || d.getTime() < min ? d.getTime() : min;
  }, null);
  const anchorStr = anchorTime !== null ? toDateOnly(new Date(anchorTime)) : null;
  const newAnchorStr = parsed.data.startDate;
  const cal = await loadSchedulingCalendar();

  function shift(d: Date | null): string | null {
    if (!d || anchorStr === null) return null;
    const workingDayOffset = countWorkingDaysInclusive(anchorStr, toDateOnly(d), cal) - 1;
    if (workingDayOffset < 0) {
      // Source date was BEFORE the anchor — shouldn't normally happen since
      // anchor is the min, but if a task has only dueDate and it landed on a
      // non-working day, we still want a graceful output.
      return newAnchorStr;
    }
    return addWorkingDays(newAnchorStr, workingDayOffset + 1, cal);
  }
  function shiftEndFromStart(shiftedStart: string | null, duration: number | null, sourceEnd: Date | null): string | null {
    if (!shiftedStart) return null;
    if (duration && duration > 0) {
      return addWorkingDays(shiftedStart, duration, cal);
    }
    return shift(sourceEnd);
  }

  try {
    const newProject = await prisma.project.create({
      data: { name: parsed.data.name, code: parsed.data.code, slaTrackingEnabled: sourceProject.slaTrackingEnabled },
    });

    // Carry the source project's per-project SLA overrides onto the new
    // project so an Onboarding or Support-project template clones a live
    // SLA setup, not a fresh default. sourceSla is null when the source
    // never had custom targets set — in that case the new project falls
    // back to the org default the same way its source did.
    const sourceSla = await prisma.slaConfig.findUnique({ where: { projectId: params.id } });
    if (sourceSla) {
      await prisma.slaConfig.create({
        data: {
          projectId: newProject.id,
          criticalResponseHours: sourceSla.criticalResponseHours,
          criticalResolutionDays: sourceSla.criticalResolutionDays,
          highResponseHours: sourceSla.highResponseHours,
          highResolutionDays: sourceSla.highResolutionDays,
          mediumResponseHours: sourceSla.mediumResponseHours,
          mediumResolutionDays: sourceSla.mediumResolutionDays,
          lowResponseHours: sourceSla.lowResponseHours,
          lowResolutionDays: sourceSla.lowResolutionDays,
          cutoffDate: sourceSla.cutoffDate,
        },
      });
    }

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
          startDate: (() => {
            const s = shift(t.startDate);
            return s ? new Date(`${s}T00:00:00.000Z`) : null;
          })(),
          dueDate: (() => {
            const s = shift(t.startDate);
            const e = shiftEndFromStart(s, t.durationDays, t.dueDate);
            return e ? new Date(`${e}T00:00:00.000Z`) : null;
          })(),
          durationDays: t.durationDays,
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
