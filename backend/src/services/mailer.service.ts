import nodemailer from 'nodemailer';
import type { Email, Sender } from '@prisma/client';
import { getTransport } from './sender.service';
import { htmlToText, looksLikeHtml } from '../utils/html';
import type { DecodedAttachment } from './attachment.service';

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendEmail(email: Email, sender: Sender, attachments: DecodedAttachment[] = []): Promise<SendResult> {
  const transport = getTransport(sender);
  const info = await transport.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to: email.toEmail,
    subject: email.subject,
    text: looksLikeHtml(email.body) ? htmlToText(email.body) : email.body,
    html: looksLikeHtml(email.body) ? email.body : email.body.replace(/\n/g, '<br/>'),
    // stable Message-ID: if a retry ever slips through after a crash, the
    // receiving side sees the same message instead of a brand new one
    messageId: `<${email.id}@email-scheduler.local>`,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.data, contentType: a.contentType })),
  });

  return {
    messageId: info.messageId,
    previewUrl: (nodemailer.getTestMessageUrl(info) as string | false) || null,
  };
}
