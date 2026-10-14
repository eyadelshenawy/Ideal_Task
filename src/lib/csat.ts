import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/notifications";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function surveyEmailHtml(p: { code: string | null; title: string; projectName: string; link: string }): string {
  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<a href="${p.link}?score=${n}" style="display:inline-block;margin:0 4px;padding:10px 14px;border-radius:8px;background:#E4F0EA;color:#0A5A46;font-size:18px;font-weight:bold;text-decoration:none;">${n}&nbsp;★</a>`)
    .join("");
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background:#0A5A46;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold;">${escapeHtml(p.projectName)}</div>
      <div style="border:1px solid #E5E7E3;border-top:none;padding:18px;border-radius:0 0 10px 10px;">
        <p style="font-size:15px;color:#111;margin-top:0;">Your request has been resolved:</p>
        <p style="font-size:15px;"><strong>${p.code ? `${escapeHtml(p.code)} — ` : ""}${escapeHtml(p.title)}</strong></p>
        <p style="color:#444;">How satisfied are you with how we handled it? One click is enough.</p>
        <p style="text-align:center;margin:20px 0;">${stars}</p>
        <p style="color:#888;font-size:12px;">1 = very unsatisfied, 5 = very satisfied. You can add a comment on the next page.</p>
      </div>
    </div>
  `;
}

/**
 * Emails a one-time satisfaction survey when a customer ticket is first
 * closed: the project is SLA-tracked (a support project) and the ticket has
 * an external contact with an email. Never sends twice for the same ticket.
 */
export async function maybeSendSurvey(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      code: true, title: true, status: true, deletedAt: true,
      project: { select: { name: true, slaTrackingEnabled: true } },
      contactAssignees: { select: { email: true } },
      survey: { select: { id: true } },
    },
  });
  if (!task || task.deletedAt || task.status !== "DONE" || task.survey) return;
  if (!task.project?.slaTrackingEnabled) return;
  const email = task.contactAssignees.map((c) => c.email?.trim()).find((e): e is string => !!e);
  if (!email) return;

  const token = randomBytes(12).toString("base64url");
  try {
    await prisma.satisfactionSurvey.create({ data: { taskId, token, email } });
  } catch {
    return; // A concurrent close already created it.
  }
  await sendEmail({
    to: email,
    subject: `How did we do? ${task.code ?? task.title}`,
    html: surveyEmailHtml({ code: task.code, title: task.title, projectName: task.project.name, link: `${APP_URL}/rate/${token}` }),
  });
}
