import { Router } from 'express';
import { z } from 'zod';
import type { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { scheduleCampaign } from '../services/schedule.service';
import { isSearchAvailable, searchEmails } from '../services/search.service';
import { createLogger } from '../lib/logger';
import { notFound } from '../utils/errors';

const log = createLogger('emails');

export const emailRouter = Router();
emailRouter.use(requireAuth);

const MAX_RECIPIENTS = 10000;

const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required').max(50000),
  emails: z.array(z.email()).min(1, 'Add at least one recipient').max(MAX_RECIPIENTS),
  startAt: z.coerce.date(),
  delayMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000),
  hourlyLimit: z.coerce.number().int().min(1).max(100000),
});

emailRouter.post('/schedule', async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  // a start time in the past just means "now"
  if (input.startAt.getTime() < Date.now()) input.startAt = new Date();

  const { campaign, count } = await scheduleCampaign(req.user!.id, input);
  res.status(201).json({ campaignId: campaign.id, scheduled: count, startAt: campaign.startAt });
});

const TAB_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['SCHEDULED', 'SENDING'],
  sent: ['SENT', 'FAILED'],
};

const listSchema = z.object({
  type: z.enum(['scheduled', 'sent']).default('scheduled'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const emailSelect = {
  id: true,
  campaignId: true,
  toEmail: true,
  subject: true,
  body: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  previewUrl: true,
  error: true,
  rateLimited: true,
  sender: { select: { email: true, name: true } },
} satisfies Prisma.EmailSelect;

emailRouter.get('/', async (req, res) => {
  const { type, q, page, limit } = listSchema.parse(req.query);
  const userId = req.user!.id;
  const statuses = TAB_STATUSES[type];
  const orderBy: Prisma.EmailOrderByWithRelationInput =
    type === 'scheduled' ? { scheduledAt: 'asc' } : { sentAt: 'desc' };
  const skip = (page - 1) * limit;

  if (q && isSearchAvailable()) {
    try {
      const { ids, total } = await searchEmails({ userId, q, statuses, from: skip, size: limit });
      const rows = await prisma.email.findMany({ where: { id: { in: ids }, userId }, select: emailSelect });
      const byId = new Map(rows.map((r) => [r.id, r]));
      // keep elasticsearch relevance order; drop docs whose status moved on since indexing
      const items = ids.map((id) => byId.get(id)).filter((r) => r && statuses.includes(r.status));
      return res.json({ items, total, page, limit, source: 'elasticsearch' });
    } catch (err) {
      log.warn('elasticsearch query failed, using db', err);
    }
  }

  const where: Prisma.EmailWhereInput = {
    userId,
    status: { in: statuses },
    ...(q
      ? {
          OR: [
            { toEmail: { contains: q, mode: 'insensitive' } },
            { subject: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.email.findMany({ where, select: emailSelect, orderBy, skip, take: limit }),
    prisma.email.count({ where }),
  ]);
  res.json({ items, total, page, limit, source: 'db' });
});

emailRouter.get('/stats', async (req, res) => {
  const grouped = await prisma.email.groupBy({
    by: ['status'],
    where: { userId: req.user!.id },
    _count: { _all: true },
  });
  const count = (s: EmailStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  res.json({
    scheduled: count('SCHEDULED') + count('SENDING'),
    sent: count('SENT') + count('FAILED'),
    failed: count('FAILED'),
  });
});

emailRouter.get('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    select: { ...emailSelect, attempts: true, messageId: true, createdAt: true },
  });
  if (!email) throw notFound('Email not found');
  res.json({ email });
});
