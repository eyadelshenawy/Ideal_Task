import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { slaRiskEmailHtml } from "@/lib/notifications";
import { notify } from "@/lib/inAppNotify";
import { responseSlaState, resolutionSlaState, responseDeadline, resolutionDeadline } from "@/lib/sla";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides, loadBusinessCalendar, clockFor, type SlaConfigDto } from "@/lib/slaConfig";

// Warns assignees once per deadline when a ticket enters the last quarter of
// its response or resolution window. Called by the daily notify cron and by
// the 15-minute /api/cron/sla-check during working hours; the
// *RiskNotifiedAt stamps keep repeated runs from re-sending.
export async function checkSlaRisks(now: Date): Promise<{ responseWarned: number; resolutionWarned: number }> {
  const trackedProjects = await prisma.project.findMany({
    where: { slaTrackingEnabled: true, deletedAt: null, isTemplate: false },
    select: { id: true, slaBusinessHours: true },
  });
  const trackedProjectIds = trackedProjects.map((p) => p.id);
  const businessHoursProjectIds = new Set(trackedProjects.filter((p) => p.slaBusinessHours).map((p) => p.id));
  if (trackedProjectIds.length === 0) return { responseWarned: 0, resolutionWarned: 0 };

  const [defaultConfig, overrides, calendar, tasks] = await Promise.all([
    loadDefaultSlaConfig(),
    loadAllProjectSlaOverrides(),
    loadBusinessCalendar(),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        projectId: { in: trackedProjectIds },
        project: { isTemplate: false },
        OR: [{ responseRiskNotifiedAt: null }, { resolutionRiskNotifiedAt: null }],
      },
      select: {
        id: true, title: true, priority: true, createdAt: true, completedAt: true, projectId: true,
        responseRiskNotifiedAt: true, resolutionRiskNotifiedAt: true,
        project: { select: { name: true } },
        assignees: { select: { id: true, email: true } },
      },
    }),
  ]);
  if (tasks.length === 0) return { responseWarned: 0, resolutionWarned: 0 };

  const comments = await prisma.taskEvent.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, type: "COMMENT" },
    select: { taskId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstCommentAt = new Map<string, string>();
  for (const c of comments) {
    if (!firstCommentAt.has(c.taskId)) firstCommentAt.set(c.taskId, c.createdAt.toISOString());
  }

  const configFor = (projectId: string): SlaConfigDto => overrides[projectId] ?? defaultConfig;

  let responseWarned = 0;
  let resolutionWarned = 0;

  for (const task of tasks) {
    if (!task.projectId) continue;
    const config = configFor(task.projectId);
    if (config.cutoffDate && task.createdAt.toISOString().slice(0, 10) < config.cutoffDate) continue;

    const clock = clockFor(businessHoursProjectIds.has(task.projectId), calendar);
    const createdAtIso = task.createdAt.toISOString();
    const recipients = task.assignees.map((a) => a.email).filter(Boolean);
    const summary = { title: task.title, projectName: task.project?.name ?? null, dueDate: null, priority: task.priority };

    if (!task.responseRiskNotifiedAt) {
      const state = responseSlaState(task.priority, createdAtIso, firstCommentAt.get(task.id) ?? null, now, config.targets, clock);
      if (state === "pending") {
        // "At risk" = inside the last quarter of the window, measured in wall-clock time.
        const deadline = responseDeadline(task.priority, task.createdAt, config.targets, clock).getTime();
        const hoursRemaining = (deadline - now.getTime()) / 3600000;
        const windowHours = (deadline - task.createdAt.getTime()) / 3600000;
        if (hoursRemaining > 0 && hoursRemaining <= windowHours * 0.25) {
          const timeLeft = hoursRemaining >= 1 ? `${Math.round(hoursRemaining)}h` : `${Math.max(1, Math.round(hoursRemaining * 60))}m`;
          if (recipients.length > 0) {
            await sendEmail({ to: recipients, subject: `SLA at risk: "${task.title}"`, html: slaRiskEmailHtml(summary, "response", timeLeft) });
          }
          await notify(task.assignees.map((a) => a.id), `Response SLA at risk on "${task.title}" — ${timeLeft} left`, task.id);
          await prisma.task.update({ where: { id: task.id }, data: { responseRiskNotifiedAt: now } });
          responseWarned++;
        }
      }
    }

    if (!task.resolutionRiskNotifiedAt) {
      const state = resolutionSlaState(task.priority, createdAtIso, task.completedAt ? task.completedAt.toISOString() : null, now, config.targets, clock);
      if (state === "pending") {
        const deadline = resolutionDeadline(task.priority, task.createdAt, config.targets, clock).getTime();
        const daysRemaining = (deadline - now.getTime()) / 86400000;
        const windowDays = (deadline - task.createdAt.getTime()) / 86400000;
        if (daysRemaining > 0 && daysRemaining <= windowDays * 0.25) {
          const timeLeft = daysRemaining >= 1 ? `${Math.round(daysRemaining)}d` : `${Math.max(1, Math.round(daysRemaining * 24))}h`;
          if (recipients.length > 0) {
            await sendEmail({ to: recipients, subject: `SLA at risk: "${task.title}"`, html: slaRiskEmailHtml(summary, "resolution", timeLeft) });
          }
          await notify(task.assignees.map((a) => a.id), `Resolution SLA at risk on "${task.title}" — ${timeLeft} left`, task.id);
          await prisma.task.update({ where: { id: task.id }, data: { resolutionRiskNotifiedAt: now } });
          resolutionWarned++;
        }
      }
    }
  }

  return { responseWarned, resolutionWarned };
}
