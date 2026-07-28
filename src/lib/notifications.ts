import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

type TaskSummary = {
  title: string;
  projectName: string | null;
  dueDate: string | null;
  priority: string;
};

function wrap(heading: string, task: TaskSummary) {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111;">${heading}</h2>
      <p style="font-size:16px;"><strong>${task.title}</strong></p>
      <ul style="color:#444; padding-left:18px;">
        ${task.projectName ? `<li>Project: ${task.projectName}</li>` : ""}
        ${task.dueDate ? `<li>Due date: ${task.dueDate}</li>` : ""}
        <li>Priority: ${task.priority}</li>
      </ul>
      <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2563eb;">Open IDEAL Tasks</a></p>
    </div>
  `;
}

async function loadProjectName(projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  return project?.name ?? null;
}

/** Emails only the users newly added as assignees — not the whole assignee list. */
export async function notifyAssignment(
  task: { id: string; title: string; dueDate: Date | null; priority: string; projectId: string | null },
  newlyAssignedUserIds: string[]
) {
  if (newlyAssignedUserIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: newlyAssignedUserIds }, active: true },
    select: { email: true },
  });
  const recipients = users.map((u) => u.email);
  if (recipients.length === 0) return;

  const projectName = await loadProjectName(task.projectId);
  await sendEmail({
    to: recipients,
    subject: `You've been assigned: "${task.title}"`,
    html: wrap("New task assignment", {
      title: task.title,
      projectName,
      dueDate: utcToDateStr(task.dueDate),
      priority: task.priority,
    }),
  });
}

export function dueSoonEmailHtml(task: TaskSummary) {
  return wrap("Due tomorrow", task);
}

export function overdueEmailHtml(task: TaskSummary) {
  return wrap("Task overdue", task);
}
