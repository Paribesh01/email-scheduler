import { Client } from '@elastic/elasticsearch';
import type { Email, EmailStatus, Sender } from '@prisma/client';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';

const log = createLogger('search');
const index = env.ELASTICSEARCH_INDEX;

const enabled = Boolean(env.ELASTICSEARCH_URL);

export const es = new Client({
  node: env.ELASTICSEARCH_URL || 'http://localhost:9200',
  requestTimeout: 5000,
  ...(env.ELASTICSEARCH_API_KEY ? { auth: { apiKey: env.ELASTICSEARCH_API_KEY } } : {}),
});

export interface EmailDoc {
  id: string;
  userId: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  senderEmail?: string;
  scheduledAt: string;
  sentAt: string | null;
}

let available = false;
export const isSearchAvailable = () => available;

export async function initSearch() {
  if (!enabled) {
    log.info('ELASTICSEARCH_URL not set, search uses the database');
    return;
  }
  try {
    const exists = await es.indices.exists({ index });
    if (!exists) {
      await es.indices.create({
        index,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            toEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
          },
        },
      });
      log.info(`created index "${index}"`);
    }
    available = true;
  } catch (err) {
    // search is a nice-to-have; scheduling must keep working without it
    available = false;
    log.warn('elasticsearch not reachable, falling back to db search (retrying in 15s)', err);
    setTimeout(() => void initSearch(), 15_000).unref();
  }
}

export function toDoc(email: Email & { sender?: Sender | null }): EmailDoc {
  return {
    id: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    toEmail: email.toEmail,
    subject: email.subject,
    body: email.body,
    status: email.status,
    senderEmail: email.sender?.email,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
  };
}

export async function indexEmails(emails: EmailDoc[]) {
  if (!available || emails.length === 0) return;
  try {
    const operations = emails.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) log.warn('some documents failed to index');
  } catch (err) {
    log.warn('bulk index failed', err);
  }
}

export async function updateEmailDoc(id: string, patch: Partial<EmailDoc>) {
  if (!available) return;
  try {
    await es.update({ index, id, doc: patch, doc_as_upsert: false, retry_on_conflict: 3 });
  } catch (err) {
    log.warn(`update failed for ${id}`, err);
  }
}

export async function searchEmails(params: {
  userId: string;
  q: string;
  statuses: EmailStatus[];
  from: number;
  size: number;
}): Promise<{ ids: string[]; total: number }> {
  const res = await es.search<EmailDoc>({
    index,
    from: params.from,
    size: params.size,
    query: {
      bool: {
        filter: [{ term: { userId: params.userId } }, { terms: { status: params.statuses } }],
        must: [
          {
            multi_match: {
              query: params.q,
              fields: ['toEmail^3', 'subject^2', 'body'],
              type: 'bool_prefix',
            },
          },
        ],
      },
    },
    sort: [{ _score: { order: 'desc' } }, { scheduledAt: { order: 'desc' } }],
    _source: false,
  });

  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  return { ids: res.hits.hits.map((h) => h._id!).filter(Boolean), total };
}
