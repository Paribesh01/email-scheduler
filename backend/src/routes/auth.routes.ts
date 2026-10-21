import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../middleware/auth';
import { notFound } from '../utils/errors';

const log = createLogger('auth');
const STATE_COOKIE = 'oauth_state';

const google = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
});

export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(
    google.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    }),
  );
});

authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) return fail(error);
  if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
  res.clearCookie(STATE_COOKIE);

  try {
    const { tokens } = await google.getToken(code);
    const ticket = await google.verifyIdToken({ idToken: tokens.id_token!, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('no_profile');

    const user = await prisma.user.upsert({
      where: { googleId: p.sub },
      update: { email: p.email, name: p.name ?? p.email, avatarUrl: p.picture },
      create: { googleId: p.sub, email: p.email, name: p.name ?? p.email, avatarUrl: p.picture },
    });

    setSessionCookie(res, signSession({ id: user.id, email: user.email }));
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    log.error('google callback failed', err);
    fail('google_failed');
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) return next(notFound('User not found'));
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
