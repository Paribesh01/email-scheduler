import nodemailer from 'nodemailer';
import type { Email, Sender } from '@prisma/client';
import { getTransport } from './sender.service';

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(email: Email, sender: Sender): Promise<SendResult> {
  const transport = getTransport(sender);
  const info = await transport.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: email.toEmail,
    subject: email.subject,
    text: email.body,
    html: email.body.replace(/\n/g, '<br/>'),
    // stable Message-ID: if a retry ever slips through after a crash, the
    // receiving side sees the same message instead of a brand new one
    messageId: `<${email.id}@email-scheduler.local>`,
  });

  return {
    messageId: info.messageId,
    previewUrl: (nodemailer.getTestMessageUrl(info) as string | false) || null,
  };
}
