import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { releaseFields, withDescendants } from "@/lib/hold";

// Tasks on hold, for Settings → On hold. Same who-sees-what rule as the main
// list (Super Admins: all; others: projects they administer), minus private tasks.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && access.administeredProjectIds.length === 0) return NextResponse.json([]);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      isPrivate: false,
      onHoldAt: { not: null },
      ...(access.isSuperAdmin ? {} : { projectId: { in: access.administeredProjectIds } }),
    },
    select: { id: true, code: true, title: true, status: true, onHoldAt: true, parentId: true, project: { select: { id: true, name: true } } },
    orderBy: [{ projectId: "asc" }, { code: "asc" }],
  });
  return NextResponse.json(tasks.map((t) => ({
    id: t.id, code: t.code, title: t.title, status: t.status, parentId: t.parentId,
    onHoldAt: t.onHoldAt!.toISOString(), projectId: t.project?.id ?? null, projectName: t.project?.name ?? "No project",
  })));
}

const holdSchema = z.object({
  hold: z.boolean(), // true = put on hold, false = bring back
  taskIds: z.array(z.string().min(1)).max(2000).optional(),
  projectId: z.string().min(1).optional(), // every task in the project
}).refine((d) => d.taskIds?.length || d.projectId, { message: "Pick tasks or a project" });

/**
 * Put tasks on hold or bring them back. A task always takes its subtasks with
 * it. Only Super Admins and admins of the task's project may do this; tasks
 * they can't manage are skipped and reported back.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const parsed = holdSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { hold, taskIds, projectId } = parsed.data;
  const access = await getUserAccess(session);
  const canManage = (pid: string | null) => access.isSuperAdmin || (pid !== null && access.administeredProjectIds.includes(pid));

  const startIds = projectId
    ? (await prisma.task.findMany({ where: { projectId, deletedAt: null, isPrivate: false }, select: { id: true } })).map((t) => t.id)
    : taskIds!;
  const ids = await withDescendants(prisma, startIds);
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, deletedAt: null, isPrivate: false, onHoldAt: hold ? null : { not: null } },
    select: { id: true, code: true, status: true, projectId: true, onHoldAt: true, pausedMinutes: true, pausedDays: true, startDate: true, dueDate: true, durationDays: true },
  });

  const done: string[] = [];
  const skipped: string[] = [];
  const now = new Date();
  for (const t of tasks) {
    if (!canManage(t.projectId)) { skipped.push(t.id); continue; }
    const data = hold ? { onHoldAt: now } : await releaseFields(prisma, t, now);
    await prisma.task.update({ where: { id: t.id }, data });
    done.push(t.id);
    logActivity(t.id, session.user.id, hold ? "Put on hold" : "Brought back from hold").catch((err) => console.error("hold activity failed:", err));
  }
  if (done.length > 0) {
    logAudit(session.user.id, `${hold ? "Put on hold" : "Brought back from hold"}: ${done.length} task(s)${projectId ? " (whole project)" : ""}`);
  }
  return NextResponse.json({ done: done.length, skipped: skipped.length });
}
