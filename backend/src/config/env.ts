import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BACKEND_URL: z.string().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),
  // Elastic Cloud style auth; for Bonsai just put user:pass in the url
  ELASTICSEARCH_API_KEY: z.string().default(''),

  JWT_SECRET: z.string().min(8),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default(''),

  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_REDIRECT_URI: z.string().default(''),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),

  ETHEREAL_ACCOUNTS: z.string().default(''),
  ETHEREAL_SENDER_COUNT: z.coerce.number().int().positive().default(3),

  RUN_API: bool(true),
  RUN_WORKER: bool(true),

  BULL_BOARD_AUTH: z.string().default(''),

  // built React app to serve from this server (single-service deploys)
  FRONTEND_DIST: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment config:', z.treeifyError(parsed.error));
  process.exit(1);
}

const e = parsed.data;

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  GOOGLE_REDIRECT_URI: e.GOOGLE_REDIRECT_URI || `${e.BACKEND_URL}/api/auth/google/callback`,
  SLACK_REDIRECT_URI: e.SLACK_REDIRECT_URI || `${e.BACKEND_URL}/api/slack/callback`,
};
