import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { emailQueue } from './queue/email.queue';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth.routes';
import { emailRouter } from './routes/email.routes';
import { slackRouter } from './routes/slack.routes';

function bullBoardAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.BULL_BOARD_AUTH) return next();
  const expected = `Basic ${Buffer.from(env.BULL_BOARD_AUTH).toString('base64')}`;
  if (req.headers.authorization === expected) return next();
  res.set('WWW-Authenticate', 'Basic realm="queues"').status(401).send('Auth required');
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  // attachments come in as base64 (up to 10 MB of files, ~14 MB encoded)
  app.use(express.json({ limit: '16mb' }));
  app.use(cookieParser());

  // live queue dashboard
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  app.use('/admin/queues', bullBoardAuth, board.getRouter());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/slack', slackRouter);

  app.get('/api/senders', requireAuth, async (_req, res) => {
    const senders = await prisma.sender.findMany({ select: { id: true, email: true, name: true } });
    res.json({ senders });
  });

  app.get('/api/config', requireAuth, (_req, res) => {
    res.json({
      minDelayBetweenSendsMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
      maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      workerConcurrency: env.WORKER_CONCURRENCY,
    });
  });

  // in production the same server hands out the React build, so the session
  // cookie is first-party and there's no CORS to deal with
  const dist = env.FRONTEND_DIST && path.resolve(env.FRONTEND_DIST);
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|admin\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
