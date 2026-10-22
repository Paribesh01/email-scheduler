import { Redis } from 'ioredis';
import type { RedisOptions } from 'bullmq';
import { env } from '../config/env';

// BullMQ wants plain options (it opens its own connections) and requires
// maxRetriesPerRequest = null for blocking commands used by workers.
export function redisOptions(): RedisOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // 0 = resolve both IPv4 and IPv6 (Railway's private network is IPv6 only)
    family: 0,
    // hosted redis drops idle sockets; keep-alive avoids the ETIMEDOUT/reconnect churn
    keepAlive: 30_000,
    maxRetriesPerRequest: null,
  };
}

// shared client for our own keys (rate limit counters, dedupe flags)
export const redis = new Redis(redisOptions());
