import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Customer satisfaction summary for the tickets matching `taskWhere`. Shared
 * by GET /api/reports/csat and the MCP get_report tool.
 * average = sum of ratings ÷ number of responses, rounded to 1 decimal.
 */
export async function csatSummary(taskWhere: Prisma.TaskWhereInput) {
  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { task: { AND: [taskWhere, { deletedAt: null }] } },
    select: {
      rating: true, comment: true, respondedAt: true, taskId: true,
      task: { select: { code: true, title: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { sentAt: "desc" },
  });

  const byProject = new Map<string, { projectName: string; sent: number; responded: number; total: number }>();
  for (const s of surveys) {
    const key = s.task.projectId ?? "none";
    const row = byProject.get(key) ?? { projectName: s.task.project?.name ?? "No project", sent: 0, responded: 0, total: 0 };
    row.sent++;
    if (s.rating !== null) { row.responded++; row.total += s.rating; }
    byProject.set(key, row);
  }
  const rated = surveys.filter((s) => s.rating !== null);

  return {
    sent: surveys.length,
    responded: rated.length,
    average: rated.length ? Math.round((rated.reduce((a, s) => a + (s.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
    projects: Array.from(byProject.values()).map((p) => ({
      projectName: p.projectName,
      sent: p.sent,
      responded: p.responded,
      average: p.responded ? Math.round((p.total / p.responded) * 10) / 10 : null,
    })),
    recent: rated
      .sort((a, b) => (b.respondedAt?.getTime() ?? 0) - (a.respondedAt?.getTime() ?? 0))
      .slice(0, 10)
      .map((s) => ({ taskId: s.taskId, code: s.task.code, title: s.task.title, rating: s.rating, comment: s.comment })),
  };
}
