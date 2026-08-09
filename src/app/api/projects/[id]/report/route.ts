import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { responseSlaState, resolutionSlaState } from "@/lib/sla";
import { loadSlaConfig, loadDefaultSlaConfig } from "@/lib/slaConfig";

// A one-page, print-ready snapshot of a project for sending to a client —
// counts + completion rate, and (for SLA-tracked projects) a response/
// resolution breakdown. Same completion-rate math as the public share page,
// just reachable only from inside the app (an admin generates it, then
// saves/emails the resulting PDF themselves — this isn't a standing public
// link like /share/[token]).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireProjectAccess(params.id);
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, code: true, deletedAt: true, slaTrackingEnabled: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, deletedAt: null },
    select: { id: true, priority: true, status: true, dueDate: true, createdAt: true, completedAt: true },
  });

  const today = new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate.toISOString().slice(0, 10) < today).length;

  let sla: {
    response: { met: number; breached: number; pending: number };
    resolution: { met: number; breached: number; pending: number };
  } | null = null;

  if (project.slaTrackingEnabled) {
    const config = (await loadSlaConfig(project.id)) ?? (await loadDefaultSlaConfig());
    const inScope = config.cutoffDate
      ? tasks.filter((t) => t.createdAt.toISOString().slice(0, 10) >= config.cutoffDate!)
      : tasks;

    const comments = await prisma.taskEvent.findMany({
      where: { taskId: { in: inScope.map((t) => t.id) }, type: "COMMENT" },
      select: { taskId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const firstCommentAt = new Map<string, string>();
    for (const c of comments) {
      if (!firstCommentAt.has(c.taskId)) firstCommentAt.set(c.taskId, c.createdAt.toISOString());
    }

    const now = new Date();
    const tally = { met: 0, breached: 0, pending: 0 };
    const response = { ...tally };
    const resolution = { ...tally };
    for (const t of inScope) {
      const createdAtIso = t.createdAt.toISOString();
      response[responseSlaState(t.priority, createdAtIso, firstCommentAt.get(t.id) ?? null, now, config.targets)]++;
      resolution[resolutionSlaState(t.priority, createdAtIso, t.completedAt ? t.completedAt.toISOString() : null, now, config.targets)]++;
    }
    sla = { response, resolution };
  }

  return NextResponse.json({
    projectName: project.name,
    projectCode: project.code,
    generatedAt: new Date().toISOString(),
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    counts: { total, done, open: total - done, overdue },
    sla,
  });
}
