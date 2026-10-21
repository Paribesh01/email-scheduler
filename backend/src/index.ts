import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { env } from './config/env';
import { createLogger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { createApp } from './app';
import { emailQueue } from './queue/email.queue';
import { startEmailWorker } from './workers/email.worker';
import { closeTransports, ensureSenders } from './services/sender.service';
import { initSearch } from './services/search.service';
import { reconcileScheduledJobs } from './services/schedule.service';

const log = createLogger('main');

async function main() {
  await prisma.$connect();
  await initSearch();
  const senders = await ensureSenders();
  log.info(`senders: ${senders.map((s) => s.email).join(', ')}`);

  let server: Server | undefined;
  let worker: Worker | undefined;

  if (env.RUN_API) {
    // put back anything the queue is missing before we start taking traffic
    await reconcileScheduledJobs();
    server = createApp().listen(env.PORT, () => {
      log.info(`api on :${env.PORT}  queue dashboard -> ${env.BACKEND_URL}/admin/queues`);
    });
  }

  if (env.RUN_WORKER) worker = startEmailWorker();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, shutting down`);
    // worker.close() waits for in-flight jobs to finish, delayed ones stay in redis
    await Promise.allSettled([
      worker?.close(),
      new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
    ]);
    await Promise.allSettled([emailQueue.close(), redis.quit(), prisma.$disconnect()]);
    closeTransports();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('failed to start', err);
  process.exit(1);
});
