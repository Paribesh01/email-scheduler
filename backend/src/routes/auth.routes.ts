import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { createLogger } from '../lib/logger';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../middleware/auth';
import { HttpError, notFound } from '../utils/errors';
import { hashPassword, verifyPassword } from '../utils/password';

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

    const profile = { email: p.email, name: p.name ?? p.email, avatarUrl: p.picture ?? null };
    // same email may already exist from an email/password signup - link it
    const existing = await prisma.user.findFirst({
      where: { OR: [{ googleId: p.sub }, { email: p.email }] },
    });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { ...profile, googleId: p.sub } })
      : await prisma.user.create({ data: { ...profile, googleId: p.sub } });

    setSessionCookie(res, signSession({ id: user.id, email: user.email }));
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    log.error('google callback failed', err);
    fail('google_failed');
  }
});

const emailLoginSchema = z.object({
  email: z.email('Enter a valid email').transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SEC = 15 * 60;

/**
 * Email + password: logs in if the account exists, otherwise signs up
 * ("or sign up through email" on the login screen).
 */
authRouter.post('/email', async (req, res) => {
  const { email, password } = emailLoginSchema.parse(req.body);

  // basic brute force guard, shared across instances via redis
  const attemptsKey = `${env.QUEUE_PREFIX}:login-attempts:${email}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, LOGIN_WINDOW_SEC);
  if (attempts > MAX_LOGIN_ATTEMPTS) throw new HttpError(429, 'Too many attempts, try again in a few minutes');

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (!user.passwordHash) {
      throw new HttpError(400, 'This account uses Google sign-in. Please continue with Google.');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Incorrect email or password');
    }
  } else {
    user = await prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: await hashPassword(password) },
    });
    log.info(`new email signup ${email}`);
  }

  await redis.del(attemptsKey);
  setSessionCookie(res, signSession({ id: user.id, email: user.email }));
  res.json({ user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
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
