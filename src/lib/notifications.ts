import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { utcToDateStr } from "@/lib/serverDates";
import { notify } from "@/lib/inAppNotify";

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
  await notify(newlyAssignedUserIds, `You've been assigned: "${task.title}"`, task.id);
}

export function dueSoonEmailHtml(task: TaskSummary) {
  return wrap("Due tomorrow", task);
}

export function overdueEmailHtml(task: TaskSummary) {
  return wrap("Task overdue", task);
}

/** Sent once, proactively, while a task's SLA deadline is still ahead but close — not yet breached. */
export function slaRiskEmailHtml(task: TaskSummary, kind: "response" | "resolution", timeLeft: string) {
  const heading = kind === "response" ? "SLA response deadline approaching" : "SLA resolution deadline approaching";
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111;">${heading}</h2>
      <p style="font-size:16px;"><strong>${task.title}</strong></p>
      <p style="color:#9A3530; font-size:14px;">${timeLeft} left before this ${kind === "response" ? "response" : "resolution"} SLA target is missed.</p>
      <ul style="color:#444; padding-left:18px;">
        ${task.projectName ? `<li>Project: ${task.projectName}</li>` : ""}
        <li>Priority: ${task.priority}</li>
      </ul>
      <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2563eb;">Open IDEAL Tasks</a></p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Sent to every Super Admin when a client submits a ticket through a project's public intake link. */
export function newTicketEmailHtml(task: { title: string; description: string; priority: string; projectName: string | null; contactName: string }) {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111;">New ticket submitted</h2>
      <p style="font-size:16px;"><strong>${escapeHtml(task.title)}</strong></p>
      <ul style="color:#444; padding-left:18px;">
        ${task.projectName ? `<li>Project: ${escapeHtml(task.projectName)}</li>` : ""}
        <li>Priority: ${task.priority}</li>
        <li>Raised by: ${escapeHtml(task.contactName)}</li>
      </ul>
      <blockquote style="border-left:3px solid #0A5A46; padding-left:12px; color:#555; margin:16px 0; white-space:pre-wrap;">${escapeHtml(task.description)}</blockquote>
      <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2563eb;">Open IDEAL Tasks</a></p>
    </div>
  `;
}

/** Emails everyone @mentioned in a comment — the in-app bell alone isn't enough for something time-sensitive. */
export async function notifyMention(
  task: { id: string; title: string },
  mentionedUserIds: string[],
  authorName: string,
  commentMessage: string
) {
  if (mentionedUserIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: mentionedUserIds }, active: true },
    select: { email: true },
  });
  const recipients = users.map((u) => u.email);
  if (recipients.length === 0) return;

  const preview = commentMessage.length > 300 ? `${commentMessage.slice(0, 300)}…` : commentMessage;
  await sendEmail({
    to: recipients,
    subject: `${authorName} mentioned you on "${task.title}"`,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#111;">You were mentioned</h2>
        <p style="font-size:14px; color:#444;">${escapeHtml(authorName)} mentioned you in a comment on <strong>${escapeHtml(task.title)}</strong>:</p>
        <blockquote style="border-left:3px solid #0A5A46; padding-left:12px; color:#555; margin:16px 0; white-space:pre-wrap;">${escapeHtml(preview)}</blockquote>
        <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2563eb;">Open IDEAL Tasks</a></p>
      </div>
    `,
  });
}
