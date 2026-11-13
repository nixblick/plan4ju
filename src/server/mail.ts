import nodemailer, { type Transporter } from "nodemailer";

// SMTP is provider independent and comes from the environment (SMTP_URL, MAIL_FROM).
// Development and tests use Mailpit; the credentials of a real provider belong in the
// server environment only.
let transporter: Transporter | undefined;

function transport(): Transporter {
  if (!transporter) {
    const url = process.env.SMTP_URL;
    if (!url) throw new Error("SMTP_URL is not set");
    transporter = nodemailer.createTransport(url);
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  await transport().sendMail({
    from: process.env.MAIL_FROM ?? "Plan4JU <noreply@localhost>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
}

/** Fire and forget with logging that never contains the message body (links carry tokens). */
export function sendMailInBackground(mail: Mail): void {
  sendMail(mail).catch((e: unknown) => {
    console.error("mail delivery failed", e instanceof Error ? e.name : "error");
  });
}
