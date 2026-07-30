import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";
import { visibleTasksWhere } from "@/lib/taskVisibility";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function taskLine(t: { code: string | null; title: string; dueDate: Date | null }): string {
  const due = utcToDateStr(t.dueDate);
  return `<li>${t.code ? `<span style="font-family:monospace;color:#666;">${t.code}</span> ` : ""}${t.title}${due ? ` — ${due}` : ""}</li>`;
}

function section(heading: string, tasks: { code: string | null; title: string; dueDate: Date | null }[]): string {
  if (tasks.length === 0) {
    return `<h3 style="margin:16px 0 4px;color:#111;">${heading} (0)</h3><p style="color:#888;margin:0;">Nothing here — all clear.</p>`;
  }
  return `<h3 style="margin:16px 0 4px;color:#111;">${heading} (${tasks.length})</h3><ul style="margin:0;padding-left:18px;color:#333;">${tasks.map(taskLine).join("")}</ul>`;
}

/** Sends one personalized weekly report to every active user, scoped to what they can see. */
export async function sendWeeklyReports(): Promise<{ sent: number }> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const sevenDaysAhead = new Date(today.getTime() + 7 * 86400000);

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true, projectAdminOf: { select: { projectId: true } } },
  });

  let sent = 0;
  for (const user of users) {
    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const administeredProjectIds = user.projectAdminOf.map((g) => g.projectId);
    const where = visibleTasksWhere(user.id, isSuperAdmin, administeredProjectIds);

    const visibleTasks = await prisma.task.findMany({
      where,
      select: {
        code: true, title: true, status: true, dueDate: true, updatedAt: true,
        project: { select: { name: true } },
      },
    });

    const doneLastWeek = visibleTasks.filter((t) => t.status === "DONE" && t.updatedAt >= sevenDaysAgo);
    const overdueNow = visibleTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "DONE");
    const dueNextWeek = visibleTasks.filter(
      (t) => t.dueDate && t.dueDate >= today && t.dueDate <= sevenDaysAhead && t.status !== "DONE"
    );

    const projectNames = new Set(visibleTasks.map((t) => t.project?.name).filter((n): n is string => !!n));
    let projectBreakdown = "";
    if (projectNames.size > 1) {
      const counts = new Map<string, number>();
      for (const t of visibleTasks) {
        if (t.status === "DONE") continue;
        const name = t.project?.name ?? "No project";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      projectBreakdown = `
        <h3 style="margin:16px 0 4px;color:#111;">By Project</h3>
        <ul style="margin:0;padding-left:18px;color:#333;">
          ${Array.from(counts.entries()).map(([name, count]) => `<li>${name}: ${count} open</li>`).join("")}
        </ul>`;
    }

    const html = `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color:#111;">Your Weekly IDEAL Tasks Summary</h2>
        ${section("Completed last 7 days", doneLastWeek)}
        ${section("Overdue now", overdueNow)}
        ${section("Due in the next 7 days", dueNextWeek)}
        ${projectBreakdown}
        <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2563eb;">Open IDEAL Tasks</a></p>
      </div>
    `;

    await sendEmail({ to: user.email, subject: "Your weekly IDEAL Tasks summary", html });
    sent++;
  }

  return { sent };
}
