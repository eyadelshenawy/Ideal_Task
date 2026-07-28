import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  const from = process.env.EMAIL_FROM;
  if (!process.env.RESEND_API_KEY || !from) {
    console.warn("RESEND_API_KEY or EMAIL_FROM not set - skipping email send.");
    return;
  }

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    console.error("Failed to send email:", error);
  }
}
