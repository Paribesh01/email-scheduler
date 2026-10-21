import { Redis, type RedisOptions } from 'ioredis';
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
    maxRetriesPerRequest: null,
  };
}

// shared client for our own keys (rate limit counters, dedupe flags)
export const redis = new Redis(redisOptions());
