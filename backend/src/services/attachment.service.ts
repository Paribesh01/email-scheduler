import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  /^image\/(png|jpe?g|gif|webp|svg\+xml)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|zip)$/,
];

export const attachmentInputSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .refine((t) => ALLOWED_TYPES.some((re) => re.test(t)), 'File type not allowed (images, PDF, Office docs, text)'),
  // base64 without the data: prefix
  data: z.string().min(1),
});

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

export interface DecodedAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export function decodeAttachments(inputs: AttachmentInput[]): DecodedAttachment[] {
  if (inputs.length > MAX_ATTACHMENTS) throw new Error(`At most ${MAX_ATTACHMENTS} attachments`);
  const decoded = inputs.map((a) => {
    const data = Buffer.from(a.data, 'base64');
    if (data.length > MAX_ATTACHMENT_BYTES) throw new Error(`${a.filename} is larger than 5 MB`);
    return { filename: a.filename, contentType: a.contentType, size: data.length, data };
  });
  const total = decoded.reduce((n, a) => n + a.size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('Attachments add up to more than 10 MB');
  return decoded;
}

// a 1000-email campaign would otherwise pull the same files from the db 1000
// times; keep them in memory for a few minutes per worker process
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; files: DecodedAttachment[] }>();

export async function getCampaignAttachments(campaignId: string): Promise<DecodedAttachment[]> {
  const hit = cache.get(campaignId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.files;

  const rows = await prisma.attachment.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
  const files = rows.map((r) => ({
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
    data: Buffer.from(r.data),
  }));

  cache.set(campaignId, { at: Date.now(), files });
  for (const [key, entry] of cache) if (Date.now() - entry.at > CACHE_TTL_MS) cache.delete(key);
  return files;
}
