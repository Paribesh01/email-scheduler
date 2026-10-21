import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { createLogger } from '../lib/logger';

const log = createLogger('senders');

const ETHEREAL_HOST = 'smtp.ethereal.email';
const ETHEREAL_PORT = 587;

/**
 * Makes sure we have at least one Ethereal sender in the db.
 * Accounts from ETHEREAL_ACCOUNTS win; otherwise we create test accounts once
 * and keep them, so restarts don't spin up fresh inboxes.
 */
export async function ensureSenders(): Promise<Sender[]> {
  const configured = env.ETHEREAL_ACCOUNTS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      return { user: pair.slice(0, idx), pass: pair.slice(idx + 1) };
    });

  for (const acc of configured) {
    await prisma.sender.upsert({
      where: { email: acc.user },
      update: { password: acc.pass },
      create: {
        email: acc.user,
        password: acc.pass,
        host: ETHEREAL_HOST,
        port: ETHEREAL_PORT,
        name: acc.user.split('@')[0],
      },
    });
  }

  let senders = await prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
  const missing = configured.length ? 0 : env.ETHEREAL_SENDER_COUNT - senders.length;

  for (let i = 0; i < missing; i++) {
    const acc = await nodemailer.createTestAccount();
    log.info(`created ethereal account ${acc.user}`);
    await prisma.sender.create({
      data: {
        email: acc.user,
        password: acc.pass,
        host: acc.smtp.host,
        port: acc.smtp.port,
        secure: acc.smtp.secure,
        name: acc.user.split('@')[0],
      },
    });
  }

  if (missing > 0) senders = await prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
  return senders;
}

const transports = new Map<string, Transporter>();

export function getTransport(sender: Sender): Transporter {
  let t = transports.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      secure: sender.secure,
      auth: { user: sender.email, pass: sender.password },
      pool: true,
      maxConnections: 2,
    });
    transports.set(sender.id, t);
  }
  return t;
}

export function closeTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}
