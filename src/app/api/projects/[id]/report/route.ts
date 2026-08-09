import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { responseSlaState, resolutionSlaState } from "@/lib/sla";
import { loadSlaConfig, loadDefaultSlaConfig } from "@/lib/slaConfig";
import { dateStrToUTC } from "@/lib/serverDates";

// A one-page, print-ready snapshot of a project for sending to a client —
// counts + completion rate, and (for SLA-tracked projects) a response/
// resolution breakdown. Same completion-rate math as the public share page,
// just reachable only from inside the app (an admin generates it, then
// saves/emails the resulting PDF themselves — this isn't a standing public
// link like /share/[token]).
//
// The snapshot counts (total/open/done/overdue/completion) are always
// "right now" — there's no historical snapshot of past task state to report
// against. An optional ?from=&to= adds a period section on top of that
// (created/completed within the range), the same idea as the Reports tab's
// "Last 7 Days" but with a range the caller picks.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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
    select: { id: true, priority: true, status: true, dueDate: true, createdAt: true, completedAt: true, updatedAt: true },
  });

  const today = new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate.toISOString().slice(0, 10) < today).length;

  const fromStr = req.nextUrl.searchParams.get("from");
  const toStr = req.nextUrl.searchParams.get("to");
  let period: { from: string; to: string; created: number; completed: number } | null = null;
  if (fromStr && toStr) {
    const from = dateStrToUTC(fromStr)!;
    const to = new Date(dateStrToUTC(toStr)!.getTime() + 86400000); // inclusive of the whole "to" day
    period = {
      from: fromStr,
      to: toStr,
      created: tasks.filter((t) => t.createdAt >= from && t.createdAt < to).length,
      completed: tasks.filter((t) => t.status === "DONE" && t.updatedAt >= from && t.updatedAt < to).length,
    };
  }

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
    period,
  });
}
