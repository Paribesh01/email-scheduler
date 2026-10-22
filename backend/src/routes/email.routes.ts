import { Router } from 'express';
import { z } from 'zod';
import type { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { scheduleCampaign } from '../services/schedule.service';
import { isSearchAvailable, searchEmails } from '../services/search.service';
import { createLogger } from '../lib/logger';
import { badRequest, notFound } from '../utils/errors';
import { attachmentInputSchema, decodeAttachments } from '../services/attachment.service';

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
  senderId: z.string().min(1).optional(),
  attachments: z.array(attachmentInputSchema).max(5).default([]),
});

emailRouter.post('/schedule', async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  // a start time in the past just means "now"
  if (input.startAt.getTime() < Date.now()) input.startAt = new Date();
  if (input.senderId && !(await prisma.sender.findUnique({ where: { id: input.senderId } }))) {
    throw badRequest('Unknown sender');
  }

  let attachments;
  try {
    attachments = decodeAttachments(input.attachments);
  } catch (err) {
    throw badRequest((err as Error).message);
  }

  const { campaign, count } = await scheduleCampaign(req.user!.id, { ...input, attachments });
  res.status(201).json({ campaignId: campaign.id, scheduled: count, startAt: campaign.startAt });
});

const TAB_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['SCHEDULED', 'SENDING'],
  sent: ['SENT', 'FAILED'],
};

const listSchema = z.object({
  type: z.enum(['scheduled', 'sent']).default('scheduled'),
  // narrows the tab further, e.g. only FAILED on the sent tab
  status: z.enum(['SCHEDULED', 'SENDING', 'SENT', 'FAILED']).optional(),
  rateLimited: z.enum(['true', 'false']).optional(),
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
  const { type, q, page, limit, status, rateLimited } = listSchema.parse(req.query);
  const userId = req.user!.id;
  const statuses = status && TAB_STATUSES[type].includes(status) ? [status] : TAB_STATUSES[type];
  const orderBy: Prisma.EmailOrderByWithRelationInput =
    type === 'scheduled' ? { scheduledAt: 'asc' } : { sentAt: 'desc' };
  const skip = (page - 1) * limit;

  if (q && isSearchAvailable() && !rateLimited) {
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
    ...(rateLimited ? { rateLimited: rateLimited === 'true' } : {}),
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
    select: {
      ...emailSelect,
      attempts: true,
      messageId: true,
      createdAt: true,
      campaign: { select: { attachments: { select: { id: true, filename: true, contentType: true, size: true } } } },
    },
  });
  if (!email) throw notFound('Email not found');
  const { campaign, ...rest } = email;
  res.json({ email: { ...rest, attachments: campaign.attachments } });
});

emailRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const att = await prisma.attachment.findFirst({
    where: {
      id: req.params.attachmentId,
      campaign: { userId: req.user!.id, emails: { some: { id: req.params.id } } },
    },
  });
  if (!att) throw notFound('Attachment not found');

  const inline = /^image\/(png|jpe?g|gif|webp)$|^application\/pdf$/.test(att.contentType);
  res.set({
    'Content-Type': att.contentType,
    'Content-Length': String(att.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(att.filename)}"`,
    'Cache-Control': 'private, max-age=3600',
    // svg could carry scripts - never let it render as a page
    'X-Content-Type-Options': 'nosniff',
    ...(att.contentType === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'" } : {}),
  });
  res.send(Buffer.from(att.data));
});
