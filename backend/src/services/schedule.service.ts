import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { emailQueue, jobOptionsFor, type EmailJobData } from '../queue/email.queue';
import { ensureSenders } from './sender.service';
import { indexEmails, toDoc } from './search.service';

const log = createLogger('schedule');
const ENQUEUE_CHUNK = 500;

export interface ScheduleInput {
  subject: string;
  body: string;
  emails: string[];
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  // pin every email to one sender; omitted = rotate across all of them
  senderId?: string;
}

function toJob(e: { id: string; userId: string; campaignId: string; senderId: string; sequence: number; scheduledAt: Date }, hourlyLimit: number) {
  const data: EmailJobData = {
    emailId: e.id,
    userId: e.userId,
    campaignId: e.campaignId,
    senderId: e.senderId,
    sequence: e.sequence,
    hourlyLimit,
  };
  return { name: 'send', data, opts: jobOptionsFor(e.id, e.scheduledAt) };
}

/**
 * DB first, queue second. If the process dies between the two, the rows are
 * still SCHEDULED and `reconcileScheduledJobs` re-adds them on next boot.
 */
export async function scheduleCampaign(userId: string, input: ScheduleInput) {
  const recipients = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))];
  const all = await ensureSenders();
  const senders = input.senderId ? all.filter((s) => s.id === input.senderId) : all;
  if (senders.length === 0) throw new Error(input.senderId ? 'unknown sender' : 'no senders configured');

  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        userId,
        subject: input.subject,
        body: input.body,
        startAt: input.startAt,
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit,
        total: recipients.length,
      },
    });

    const rows: Prisma.EmailCreateManyInput[] = recipients.map((to, i) => ({
      campaignId: c.id,
      userId,
      // round robin across senders spreads the per-sender hourly budget
      senderId: senders[i % senders.length].id,
      toEmail: to,
      subject: input.subject,
      body: input.body,
      sequence: i,
      scheduledAt: new Date(input.startAt.getTime() + i * input.delayMs),
    }));
    await tx.email.createMany({ data: rows });
    return c;
  });

  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    include: { sender: true },
    orderBy: { sequence: 'asc' },
  });

  for (let i = 0; i < emails.length; i += ENQUEUE_CHUNK) {
    const chunk = emails.slice(i, i + ENQUEUE_CHUNK);
    await emailQueue.addBulk(chunk.map((e) => toJob(e, campaign.hourlyLimit)));
  }
  await indexEmails(emails.map(toDoc));

  log.info(`campaign ${campaign.id}: queued ${emails.length} emails starting ${input.startAt.toISOString()}`);
  return { campaign, count: emails.length };
}

/**
 * Runs on boot. Redis (with AOF) normally still has every delayed job, in which
 * case this is a cheap no-op. If Redis lost data, or we crashed between the db
 * insert and the enqueue, missing jobs are re-created from the db. Because the
 * jobId is the email id, an existing job is never duplicated.
 */
export async function reconcileScheduledJobs() {
  let cursor: string | undefined;
  let checked = 0;
  let restored = 0;

  for (;;) {
    const batch = await prisma.email.findMany({
      where: { status: { in: ['SCHEDULED', 'SENDING'] } },
      include: { campaign: { select: { hourlyLimit: true } } },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    checked += batch.length;

    const missing = [];
    for (const e of batch) {
      const job = await emailQueue.getJob(e.id);
      const state = job ? await job.getState() : 'unknown';
      // completed/failed jobs whose row is still pending would never run again
      if (!job || state === 'completed' || state === 'failed' || state === 'unknown') {
        if (job) await job.remove().catch(() => undefined);
        missing.push(e);
      }
    }

    if (missing.length) {
      await emailQueue.addBulk(missing.map((e) => toJob(e, e.campaign.hourlyLimit)));
      restored += missing.length;
    }
  }

  log.info(`reconcile done: ${checked} pending emails checked, ${restored} jobs restored`);
  return { checked, restored };
}
