import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";

// Customer satisfaction summary for the tickets this user can see.
export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  const access = await getUserAccess(session);

  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { task: { AND: [visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds), { deletedAt: null }] } },
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

  return NextResponse.json({
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
  });
}
