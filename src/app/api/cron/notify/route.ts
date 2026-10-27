import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";
import { dueSoonEmailHtml, overdueEmailHtml, waitingNudgeEmailHtml } from "@/lib/notifications";
import { PAUSED_STATUSES } from "@/lib/pause";
import { STATUSES } from "@/lib/taskHelpers";
import { sendWeeklyReports } from "@/lib/weeklyReport";
import { notify } from "@/lib/inAppNotify";
import { checkSlaRisks } from "@/lib/slaRisk";
import { loadWorkDays } from "@/lib/scheduling";
import { isWorkDay, isOverdue, nextWorkDay, workDaysAfter } from "@/lib/workdays";

// Remind the team after this many working days waiting on the customer, and again every as many days after.
const WAIT_NUDGE_EVERY = 3;

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Called once a day by an external scheduler (see .github/workflows/daily-task-notifications.yml).
// On working days only (Work Calendar), it sends a one-time "due next working
// day" reminder to each task's assignees, and a daily "overdue" reminder (to
// Super Admins + the task's project admins + its assignees) for as long as a
// task stays overdue — overdue counted in working days.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfTodayUTC();
  const todayKey = utcToDateStr(today)!;
  const workDays = await loadWorkDays();
  const workingToday = isWorkDay(todayKey, workDays);
  const nextWorkKey = nextWorkDay(todayKey, workDays);
  const tomorrowKey = utcToDateStr(new Date(today.getTime() + 86400000))!;

  const [tasks, superAdmins] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        status: { not: "DONE" },
        dueDate: { not: null },
        OR: [{ projectId: null }, { project: { isTemplate: false } }],
      },
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
    prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true, email: true } }),
  ]);
  const superAdminEmails = superAdmins.map((u) => u.email);

  let dueSoonSent = 0;
  let overdueSent = 0;

  for (const task of tasks) {
    if (!task.dueDate || !workingToday) continue;
    const dueKey = utcToDateStr(task.dueDate)!;
    const summary = {
      title: task.title,
      projectName: task.project?.name ?? null,
      dueDate: utcToDateStr(task.dueDate),
      priority: task.priority,
    };

    // Due after today, up to the next working day (so a Sunday due date is
    // reminded on Thursday, not over the weekend).
    if (dueKey > todayKey && dueKey <= nextWorkKey && !task.dueSoonNotifiedAt) {
      const recipients = task.assignees.map((a) => a.email).filter(Boolean);
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          subject: `Reminder: "${task.title}" is due ${dueKey === tomorrowKey ? "tomorrow" : `on ${summary.dueDate}`}`,
          html: dueSoonEmailHtml(summary),
        });
        dueSoonSent++;
      }
      await prisma.task.update({ where: { id: task.id }, data: { dueSoonNotifiedAt: new Date() } });
    }

    if (isOverdue({ status: task.status, dueDate: dueKey }, todayKey, workDays)) {
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

  // Waiting on the customer for 3, 6, 9… working days: remind the assignees and
  // Super Admins to follow up. Internal only — nothing goes to the customer,
  // and the ticket is never closed automatically.
  let waitNudgesSent = 0;
  if (workingToday) {
    const waiting = await prisma.task.findMany({
      where: {
        deletedAt: null,
        isPrivate: false,
        status: { in: [...PAUSED_STATUSES] },
        pausedAt: { not: null },
        OR: [{ projectId: null }, { project: { isTemplate: false } }],
      },
      select: {
        id: true, title: true, priority: true, status: true, pausedAt: true,
        project: { select: { name: true } },
        assignees: { select: { id: true, email: true } },
      },
    });
    for (const task of waiting) {
      const days = workDaysAfter(utcToDateStr(task.pausedAt)!, todayKey, workDays);
      if (days === 0 || days % WAIT_NUDGE_EVERY !== 0) continue;
      const statusLabel = STATUSES.find((s) => s.id === task.status)?.label ?? task.status;
      const recipients = Array.from(new Set([...superAdminEmails, ...task.assignees.map((a) => a.email)].filter(Boolean)));
      if (recipients.length > 0) {
        await sendEmail({
          to: recipients,
          subject: `Follow up: "${task.title}" — ${statusLabel} for ${days} working days`,
          html: waitingNudgeEmailHtml({ title: task.title, projectName: task.project?.name ?? null, dueDate: null, priority: task.priority }, statusLabel, days),
        });
      }
      await notify(
        [...superAdmins.map((u) => u.id), ...task.assignees.map((a) => a.id)],
        `${statusLabel} for ${days} working days — follow up with the customer on "${task.title}"`,
        task.id,
      );
      waitNudgesSent++;
    }
  }

  // The daily check runs every morning; the weekly summary goes out on the
  // first working day of the week (Sunday, or the next working day when
  // Sunday is a holiday).
  // = today is a working day and the only one from Sunday up to today.
  const saturdayBefore = utcToDateStr(new Date(today.getTime() - (today.getUTCDay() + 1) * 86400000))!;
  const firstWorkDayOfWeek = workingToday && workDaysAfter(saturdayBefore, todayKey, workDays) === 1;
  let weeklyReportsSent: number | null = null;
  if (firstWorkDayOfWeek) {
    const result = await sendWeeklyReports();
    weeklyReportsSent = result.sent;
  }

  const slaRisk = await checkSlaRisks(new Date());

  return NextResponse.json({
    ok: true,
    checked: tasks.length,
    dueSoonSent,
    overdueSent,
    waitNudgesSent,
    weeklyReportsSent,
    slaResponseRiskWarned: slaRisk.responseWarned,
    slaResolutionRiskWarned: slaRisk.resolutionWarned,
  });
}
