import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { requireAuth, signState, verifyState } from '../middleware/auth';
import {
  disconnectSlack,
  exchangeCodeAndSave,
  isSlackConfigured,
  notifyUser,
  slackAuthorizeUrl,
} from '../services/slack.service';
import { badRequest, HttpError } from '../utils/errors';

const log = createLogger('slack');

export const slackRouter = Router();

const dashboardUrl = (status: string) => `${env.FRONTEND_URL}/dashboard?slack=${status}`;

/**
 * The frontend asks for the authorize url (with a signed state carrying the
 * user id) and then navigates to it. The callback doesn't depend on our
 * session cookie, which matters when the callback runs on an ngrok domain.
 */
slackRouter.get('/connect-url', requireAuth, (req, res) => {
  if (!isSlackConfigured()) throw new HttpError(503, 'Slack app is not configured on the server');
  res.json({ url: slackAuthorizeUrl(signState({ userId: req.user!.id })) });
});

slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (error) return res.redirect(dashboardUrl('denied'));

  const parsed = state ? verifyState<{ userId: string }>(state) : null;
  if (!code || !parsed?.userId) return res.redirect(dashboardUrl('invalid'));

  try {
    const conn = await exchangeCodeAndSave(parsed.userId, code);
    await notifyUser(
      parsed.userId,
      `:white_check_mark: Email Scheduler connected. Rate limit alerts will be posted to ${conn.channel ?? 'this channel'}.`,
    );
    res.redirect(dashboardUrl('connected'));
  } catch (err) {
    log.error('slack callback failed', err);
    res.redirect(dashboardUrl('error'));
  }
});

slackRouter.get('/status', requireAuth, async (req, res) => {
  const conn = await prisma.slackConnection.findUnique({
    where: { userId: req.user!.id },
    select: { teamName: true, channel: true, createdAt: true },
  });
  res.json({ configured: isSlackConfigured(), connected: Boolean(conn), connection: conn });
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const ok = await notifyUser(req.user!.id, ':bell: Test notification from Email Scheduler.');
  if (!ok) throw badRequest('Slack is not connected or the message could not be delivered');
  res.json({ ok });
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await disconnectSlack(req.user!.id);
  res.json({ ok: true });
});
