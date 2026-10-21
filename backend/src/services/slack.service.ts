import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';

const log = createLogger('slack');

export const SLACK_SCOPES = ['incoming-webhook'];

export const isSlackConfigured = () => Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);

export function slackAuthorizeUrl(state: string) {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_SCOPES.join(','));
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { channel: string; channel_id: string; url: string };
}

export async function exchangeCodeAndSave(userId: string, code: string) {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook || !data.team) {
    throw new Error(`slack oauth failed: ${data.error ?? 'missing webhook'}`);
  }

  const fields = {
    teamId: data.team.id,
    teamName: data.team.name,
    channel: data.incoming_webhook.channel,
    channelId: data.incoming_webhook.channel_id,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token ?? null,
  };

  return prisma.slackConnection.upsert({
    where: { userId },
    update: fields,
    create: { userId, ...fields },
  });
}

export async function disconnectSlack(userId: string) {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return;
  if (conn.accessToken) {
    // best effort, the row is removed either way
    await fetch('https://slack.com/api/auth.revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    }).catch(() => undefined);
  }
  await prisma.slackConnection.delete({ where: { userId } });
}

/**
 * Looks the connection up on every call (no caching) so connecting or
 * disconnecting from the dashboard takes effect immediately.
 * Never throws - a slack outage must not break sending.
 */
export async function notifyUser(userId: string, text: string, blocks?: unknown[]) {
  try {
    const conn = await prisma.slackConnection.findUnique({ where: { userId } });
    if (!conn) return false;

    const res = await fetch(conn.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (!res.ok) {
      const body = await res.text();
      log.warn(`webhook returned ${res.status}: ${body}`);
      // app uninstalled / channel deleted - drop the dead connection
      if (res.status === 404 || res.status === 410 || body.includes('no_service')) {
        await prisma.slackConnection.delete({ where: { userId } }).catch(() => undefined);
      }
      return false;
    }
    return true;
  } catch (err) {
    log.warn('failed to notify slack', err);
    return false;
  }
}

export async function notifyRateLimitHit(params: {
  userId: string;
  reason: 'sender' | 'campaign';
  senderEmail: string;
  limit: number;
  nextWindowStart: number;
  subject: string;
}) {
  const resumeAt = new Date(params.nextWindowStart).toUTCString();
  const who =
    params.reason === 'sender'
      ? `Sender *${params.senderEmail}* reached its hourly limit of *${params.limit}* emails.`
      : `Campaign "*${params.subject}*" reached its hourly limit of *${params.limit}* emails.`;
  const text = `:warning: Rate limit hit. ${who} Remaining emails are queued and will resume at ${resumeAt}.`;

  return notifyUser(params.userId, text, [
    { type: 'section', text: { type: 'mrkdwn', text: `:warning: *Hourly rate limit reached*\n${who}` } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Nothing was dropped. Queued emails resume at *${resumeAt}*.` }],
    },
  ]);
}
