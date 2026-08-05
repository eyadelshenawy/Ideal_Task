import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";
import { dueSoonEmailHtml, overdueEmailHtml } from "@/lib/notifications";
import { sendWeeklyReports } from "@/lib/weeklyReport";

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

  return NextResponse.json({ ok: true, checked: tasks.length, dueSoonSent, overdueSent, weeklyReportsSent });
}
