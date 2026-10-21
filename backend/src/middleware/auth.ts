import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/errors';

export const AUTH_COOKIE = 'session';
const SESSION_TTL_SEC = 7 * 24 * 3600;

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signSession(user: AuthUser) {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: SESSION_TTL_SEC });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: SESSION_TTL_SEC * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE];
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    req.user = { id: payload.sub as string, email: payload.email as string };
    next();
  } catch {
    next(unauthorized('Session expired'));
  }
}

/** short lived signed value for OAuth `state` (carries who started the flow) */
export function signState(data: Record<string, string>) {
  return jwt.sign(data, env.JWT_SECRET, { expiresIn: 600 });
}

export function verifyState<T>(state: string): T | null {
  try {
    return jwt.verify(state, env.JWT_SECRET) as T;
  } catch {
    return null;
  }
}
