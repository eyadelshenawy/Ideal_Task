import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";
import { dueSoonEmailHtml, overdueEmailHtml, slaRiskEmailHtml } from "@/lib/notifications";
import { sendWeeklyReports } from "@/lib/weeklyReport";
import { notify } from "@/lib/inAppNotify";
import { responseSlaState, resolutionSlaState } from "@/lib/sla";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides, type SlaConfigDto } from "@/lib/slaConfig";

// This check runs once a day, so it can only reliably catch risk windows at
// least ~1 day wide — i.e. resolution deadlines (days-scale) and response
// deadlines on MEDIUM/LOW priority (24-48h). A HIGH priority response target
// (commonly 4h) has a risk window under an hour wide; a once-daily check can
// land outside it entirely, in which case that task goes straight from
// "pending" to the existing overdue email with no proactive warning. This is
// an accepted, documented gap — closing it would need a much more frequent
// cron, which this codebase has already found unreliable on this platform.
async function checkSlaRisks(now: Date): Promise<{ responseWarned: number; resolutionWarned: number }> {
  const trackedProjects = await prisma.project.findMany({
    where: { slaTrackingEnabled: true, deletedAt: null },
    select: { id: true },
  });
  const trackedProjectIds = trackedProjects.map((p) => p.id);
  if (trackedProjectIds.length === 0) return { responseWarned: 0, resolutionWarned: 0 };

  const [defaultConfig, overrides, tasks] = await Promise.all([
    loadDefaultSlaConfig(),
    loadAllProjectSlaOverrides(),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        projectId: { in: trackedProjectIds },
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

    const target = config.targets[task.priority];
    const createdAtIso = task.createdAt.toISOString();
    const recipients = task.assignees.map((a) => a.email).filter(Boolean);
    const summary = { title: task.title, projectName: task.project?.name ?? null, dueDate: null, priority: task.priority };

    if (!task.responseRiskNotifiedAt) {
      const state = responseSlaState(task.priority, createdAtIso, firstCommentAt.get(task.id) ?? null, now, config.targets);
      if (state === "pending") {
        const deadline = task.createdAt.getTime() + target.responseHours * 3600000;
        const hoursRemaining = (deadline - now.getTime()) / 3600000;
        if (hoursRemaining > 0 && hoursRemaining <= target.responseHours * 0.25) {
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
      const state = resolutionSlaState(task.priority, createdAtIso, task.completedAt ? task.completedAt.toISOString() : null, now, config.targets);
      if (state === "pending") {
        const deadline = task.createdAt.getTime() + target.resolutionDays * 86400000;
        const daysRemaining = (deadline - now.getTime()) / 86400000;
        if (daysRemaining > 0 && daysRemaining <= target.resolutionDays * 0.25) {
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

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Called once a day by an external scheduler (see .github/workflows/daily-task-notifications.yml).
// Sends a one-time "due tomorrow" reminder to each task's assignees, and a
// daily "overdue" reminder (to Super Admins + the task's project admins +
// its assignees) for as long as a task stays overdue.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfTodayUTC();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [tasks, superAdmins] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, isPrivate: false, status: { not: "DONE" }, dueDate: { not: null } },
      include: {
        assignees: { select: { email: true } },
        project: {
          select: {
            name: true,
            admins: { select: { user: { select: { email: true } } } },
          },
        },
      },
    }),
    prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { email: true } }),
  ]);
  const superAdminEmails = superAdmins.map((u) => u.email);

  let dueSoonSent = 0;
  let overdueSent = 0;

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = task.dueDate.getTime();
    const summary = {
      title: task.title,
      projectName: task.project?.name ?? null,
      dueDate: utcToDateStr(task.dueDate),
      priority: task.priority,
    };

    if (due === tomorrow.getTime() && !task.dueSoonNotifiedAt) {
      const recipients = task.assignees.map((a) => a.email).filter(Boolean);
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          subject: `Reminder: "${task.title}" is due tomorrow`,
          html: dueSoonEmailHtml(summary),
        });
        dueSoonSent++;
      }
      await prisma.task.update({ where: { id: task.id }, data: { dueSoonNotifiedAt: new Date() } });
    }

    if (due < today.getTime()) {
      const projectAdminEmails = task.project?.admins.map((a) => a.user.email) ?? [];
      const assigneeEmails = task.assignees.map((a) => a.email);
      const recipients = Array.from(
        new Set([...superAdminEmails, ...projectAdminEmails, ...assigneeEmails].filter(Boolean))
      );
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          subject: `Overdue: "${task.title}"`,
          html: overdueEmailHtml(summary),
        });
        overdueSent++;
      }
    }
  }

  // The daily check runs every morning; the weekly summary only goes out on
  // Sundays (day 0), the start of the work week here.
  let weeklyReportsSent: number | null = null;
  if (today.getUTCDay() === 0) {
    const result = await sendWeeklyReports();
    weeklyReportsSent = result.sent;
  }

  const slaRisk = await checkSlaRisks(new Date());

  return NextResponse.json({
    ok: true,
    checked: tasks.length,
    dueSoonSent,
    overdueSent,
    weeklyReportsSent,
    slaResponseRiskWarned: slaRisk.responseWarned,
    slaResolutionRiskWarned: slaRisk.resolutionWarned,
  });
}
