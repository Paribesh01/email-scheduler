import { DelayedError, Worker, type Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { redisOptions } from '../lib/redis';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';
import { EMAIL_QUEUE, type EmailJobData } from '../queue/email.queue';
import { firstHitInWindow, reserveSendSlot } from '../queue/rate-limiter';
import { sendEmail } from '../services/mailer.service';
import { updateEmailDoc } from '../services/search.service';
import { notifyRateLimitHit } from '../services/slack.service';

const log = createLogger('worker');

// an email stuck in SENDING longer than this is assumed to belong to a
// worker that died mid-send and may be picked up again
const STALE_SENDING_MS = 5 * 60 * 1000;
// slots this close to "now" are just sent instead of re-delayed
const SLOT_TOLERANCE_MS = 25;

async function delayJob(job: Job<EmailJobData>, token: string | undefined, until: number): Promise<never> {
  await job.moveToDelayed(until, token);
  throw new DelayedError();
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });
  if (!email) return { skipped: 'missing' };
  if (email.status === 'SENT' || email.status === 'FAILED') return { skipped: email.status };

  if (email.status === 'SENDING') {
    const staleAt = email.updatedAt.getTime() + STALE_SENDING_MS;
    // another worker is (or was very recently) sending this one - check back later
    if (staleAt > Date.now()) return delayJob(job, token, staleAt);
  }

  // 1) rate limit + per-sender spacing. Skipped when we already own a slot.
  if (!job.data.reservedSlot) {
    const r = await reserveSendSlot({
      senderId: job.data.senderId,
      campaignId: job.data.campaignId,
      senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      campaignLimit: job.data.hourlyLimit,
      gapMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
    });

    if (!r.ok) {
      // hourly cap reached: push into the next window. Offsetting by sequence
      // keeps the original order when they all wake up again.
      const target = r.nextWindowStart + job.data.sequence;
      await prisma.email.update({
        where: { id: emailId },
        data: { scheduledAt: new Date(target), rateLimited: true },
      });
      await updateEmailDoc(emailId, { scheduledAt: new Date(target).toISOString() });

      const notifyKey = r.reason === 'sender' ? `sender:${job.data.senderId}` : `campaign:${job.data.campaignId}`;
      if (await firstHitInWindow(notifyKey, r.nextWindowStart)) {
        log.warn(`${r.reason} hourly limit hit (${notifyKey}), deferring to ${new Date(r.nextWindowStart).toISOString()}`);
        const campaign = await prisma.campaign.findUnique({
          where: { id: job.data.campaignId },
          select: { subject: true },
        });
        await notifyRateLimitHit({
          userId: job.data.userId,
          reason: r.reason,
          senderEmail: email.sender.email,
          limit: r.reason === 'sender' ? env.MAX_EMAILS_PER_HOUR_PER_SENDER : job.data.hourlyLimit,
          nextWindowStart: r.nextWindowStart,
          subject: campaign?.subject ?? email.subject,
        });
      }
      return delayJob(job, token, target);
    }

    if (r.slot - Date.now() > SLOT_TOLERANCE_MS) {
      await job.updateData({ ...job.data, reservedSlot: r.slot });
      await prisma.email.update({ where: { id: emailId }, data: { scheduledAt: new Date(r.slot) } });
      return delayJob(job, token, r.slot);
    }
  }

  // 2) claim the row. The conditional update means only one worker can
  //    move it to SENDING, even if the same job was somehow picked twice.
  const claimed = await prisma.email.updateMany({
    where: {
      id: emailId,
      OR: [
        { status: 'SCHEDULED' },
        { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
      ],
    },
    data: { status: 'SENDING', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return { skipped: 'already-claimed' };

  // 3) send
  try {
    const result = await sendEmail(email, email.sender);
    const sentAt = new Date();
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
        error: null,
      },
    });
    await updateEmailDoc(emailId, { status: 'SENT', sentAt: sentAt.toISOString() });
    log.info(`sent ${emailId} -> ${email.toEmail} via ${email.sender.email}`);
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await prisma.email.update({
      where: { id: emailId },
      data: { status: isFinal ? 'FAILED' : 'SCHEDULED', error: message },
    });
    if (isFinal) await updateEmailDoc(emailId, { status: 'FAILED' });
    // a retry has to go through the limiter again
    if (job.data.reservedSlot) await job.updateData({ ...job.data, reservedSlot: undefined });
    log.error(`send failed for ${emailId} (attempt ${job.attemptsMade + 1}${isFinal ? ', giving up' : ''})`, err);
    throw err;
  }
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmailJob, {
    connection: redisOptions(),
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on('ready', () => log.info(`worker ready (concurrency=${env.WORKER_CONCURRENCY})`));
  worker.on('error', (err) => log.error('worker error', err));

  return worker;
}
