import { Queue } from 'bullmq';
import { redisOptions } from '../lib/redis';
import { env } from '../config/env';

export const EMAIL_QUEUE = 'email-send';

export interface EmailJobData {
  emailId: string;
  userId: string;
  campaignId: string;
  senderId: string;
  sequence: number;
  hourlyLimit: number;
  // set once the rate limiter handed this job a send slot in the future
  reservedSlot?: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: redisOptions(),
  defaultJobOptions: {
    attempts: env.JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 10000 },
    removeOnFail: { age: 14 * 24 * 3600 },
  },
});

/**
 * jobId === emailId, so adding the same email twice is a no-op in BullMQ.
 * That is what keeps the enqueue + restart-reconcile paths idempotent.
 */
export function jobOptionsFor(emailId: string, scheduledAt: Date) {
  return {
    jobId: emailId,
    delay: Math.max(0, scheduledAt.getTime() - Date.now()),
  };
}
