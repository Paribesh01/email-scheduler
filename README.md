# Email Scheduler (ReachInbox assignment)

A small email scheduling service with a dashboard. You schedule emails through an API or the UI. BullMQ delayed jobs in Redis send them at the right time over Ethereal SMTP. The system survives restarts, applies per-sender and per-campaign hourly limits, and posts a Slack alert when a limit is hit.

```
emaill/
├── backend/    Express + TypeScript API, BullMQ worker, Prisma (Postgres)
├── frontend/   React + Vite + Tailwind dashboard
└── docker-compose.yml   Postgres, Redis (AOF on), Elasticsearch
```

---

## 1. Running it locally

### Prerequisites
- Node 20+ (tested on Node 25)
- Docker (for Postgres / Redis / Elasticsearch). You can also use local installs; just point the env vars at them.

### Infra

```bash
docker compose up -d
```

This starts:
| service       | host port | notes                                    |
|---------------|-----------|------------------------------------------|
| Postgres 16   | 5433      | user/pass/db = `scheduler/scheduler/email_scheduler` |
| Redis 7       | 6379      | `appendonly yes`, so delayed jobs survive a Redis restart too |
| Elasticsearch | 9200      | single node, security off (dev only)     |

### Backend

```bash
cd backend
cp .env.example .env          # fill in Google + Slack keys, see below
npm install
npx prisma migrate deploy     # or: npm run db:migrate
npm run dev                   # API + worker in one process, on :4000
```

The API and the worker can also run as separate processes, which is how you'd scale it:

```bash
npm run dev:api       # RUN_WORKER=false
npm run dev:worker    # RUN_API=false  (start as many as you like)
```

Production build: `npm run build && npm start` (or `start:api` / `start:worker`).

Useful URLs:
- `http://localhost:4000/health`
- `http://localhost:4000/admin/queues` (live Bull Board queue dashboard; optional basic auth via `BULL_BOARD_AUTH=user:pass`)

### Frontend

```bash
cd frontend
cp .env.example .env    # only needed if the backend isn't on :4000
npm install
npm run dev             # http://localhost:5173
```

In dev, Vite proxies `/api` and `/admin` to the backend, so the session cookie is same-origin and there's no CORS setup to worry about.

---

## 2. Environment / external setup

All backend config lives in `backend/.env` (see `.env.example`; every value is commented).

### Ethereal Email
You don't have to do anything. On first boot the backend calls `nodemailer.createTestAccount()` `ETHEREAL_SENDER_COUNT` times (default 3) and **stores those accounts in the `Sender` table**, so restarts reuse the same inboxes.

To use your own Ethereal accounts instead (https://ethereal.email/create):

```
ETHEREAL_ACCOUNTS=user1@ethereal.email:pass1,user2@ethereal.email:pass2
```

Every sent email has a "Open in Ethereal" link on its detail page. You can also log into ethereal.email with a sender's credentials to see the inbox.

### Google OAuth (login)
1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → Web application.
2. Authorised redirect URI: `http://localhost:4000/api/auth/google/callback`
3. Put the client id/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Flow: `/api/auth/google` → Google consent → callback verifies the ID token, upserts the user, and sets an httpOnly JWT cookie → redirect to `/dashboard`. The CSRF `state` is checked against a short-lived cookie.

### Slack (rate-limit alerts)
1. https://api.slack.com/apps → *Create New App* → From scratch.
2. *OAuth & Permissions* → add the bot scope **`incoming-webhook`**.
3. Slack only accepts **https** redirect URLs, so expose the backend with ngrok (or similar):
   ```bash
   ngrok http 4000
   ```
   Add `https://<your-ngrok-domain>/api/slack/callback` as a redirect URL in the Slack app, and set
   `SLACK_REDIRECT_URI` to the same value.
4. Fill in `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` and restart the backend.

In the dashboard, click **Connect Slack** (bottom of the sidebar). It runs the real `oauth/v2/authorize` flow, and you pick a channel. The backend exchanges the code (`oauth.v2.access`) and stores the webhook URL + token **per user** in `SlackConnection`. A confirmation message is posted to the channel straight away, and there's a **Test** button.

The callback doesn't rely on the session cookie. The user id travels in a signed, 10-minute `state` JWT, so it works when the callback lands on the ngrok domain.

---

## 3. Architecture

```
 React dashboard ──► Express API ──► Postgres (source of truth)
                         │   └──────► Elasticsearch (search index)
                         ▼
                  BullMQ queue "email-send" (Redis)
                         │  delayed jobs, jobId = emailId
                         ▼
                 Worker(s) ── Lua rate limiter (Redis) ──► Ethereal SMTP
                         └──► Slack webhook on limit hit
```

### How scheduling works
1. `POST /api/emails/schedule` with `{subject, body, emails[], startAt, delayMs, hourlyLimit}`.
2. In one DB transaction it creates a `Campaign` row plus one `Email` row per recipient (deduped, `@@unique([campaignId, toEmail])`). Each email gets
   - `scheduledAt = startAt + index * delayMs` (the "delay between emails" from the compose screen)
   - a sender, picked round-robin across the Ethereal senders
   - a `sequence` number (used to keep order later)
3. After the commit, every email is added to BullMQ as a **delayed job** (`delay = scheduledAt - now`) with **`jobId = email.id`**, in chunks of 500 via `addBulk`.
4. The emails are bulk-indexed into Elasticsearch.

No cron anywhere. Timing is BullMQ's delayed-job sorted set in Redis.

### How persistence on restart works
- **Redis holds the timers.** Delayed jobs live in Redis, and compose runs it with AOF. Killing the Node process loses nothing. When it comes back, the worker picks up whatever is due (overdue jobs run immediately) and the rest keep waiting.
- **Postgres is the source of truth.** On boot, `reconcileScheduledJobs()` walks every `SCHEDULED`/`SENDING` email and checks that a live job exists for it. If Redis lost data, or the process died between the DB insert and the enqueue, the missing jobs are re-created from the DB. Because `jobId = emailId`, this can never create a duplicate.
- **Graceful shutdown.** On SIGINT/SIGTERM, `worker.close()` waits for in-flight sends before exiting.

I tested this: scheduled 3 emails 15s out, killed the server, waited until after the send time, then started it again. All 3 went out once, with `attempts = 1`. I also deleted a job straight out of Redis and restarted; the log showed `reconcile done: 991 pending emails checked, 1 jobs restored`.

### Idempotency (no double sends)
Several layers:
1. **Enqueue:** `jobId = emailId`, so BullMQ ignores a second add of the same email.
2. **Status guard:** the worker skips anything already `SENT`/`FAILED`.
3. **Atomic claim:** before sending, the worker runs
   `UPDATE email SET status='SENDING' WHERE id=? AND status='SCHEDULED'` (Prisma `updateMany`). Only one worker can win that, even if the same job ran twice somehow.
4. **Crash in the middle of a send:** a row stuck in `SENDING` is only re-claimed once it's older than 5 minutes (the job delays itself until then instead of completing).
5. **Stable `Message-ID`** (`<emailId@email-scheduler.local>`), so a resend in that crash window is the same message to the receiving side.

Trade-off: SMTP has no transactions, so the window between "SMTP accepted it" and "DB says SENT" can't be closed completely. If the process dies in exactly that window, the email may be resent once (at-least-once in that edge case, exactly-once otherwise).

### Rate limiting, delay & concurrency

| Setting | Where | Default |
|---|---|---|
| Worker concurrency | `WORKER_CONCURRENCY` | 5 |
| Min delay between sends (per sender) | `MIN_DELAY_BETWEEN_SENDS_MS` | **2000 ms** |
| Max emails / hour / sender | `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 |
| Max emails / hour / campaign | "Hourly Limit" on the compose screen | user-chosen |
| Delay between emails in a campaign | "Delay between 2 emails" on the compose screen | user-chosen |
| Retries | `JOB_ATTEMPTS` (exponential backoff from 5s) | 3 |

**Delay between sends:** I chose a minimum of 2 seconds between two emails from the same sender. It's per sender, not global, so with 3 senders and concurrency 5 you get about 3 sends every 2s. One slow inbox doesn't stall the others.

**How it's enforced:** a single Redis Lua script (`backend/src/queue/rate-limiter.ts`) does an atomic *slot reservation*:

1. `slot = max(now, nextFreeSlot[sender])`. This is the min-gap part.
2. Work out the hour window for that slot (`floor(slot / 1h)`; windows are clock hours in UTC).
3. If `rl:sender:{id}:{window} >= MAX_EMAILS_PER_HOUR_PER_SENDER`, or `rl:campaign:{id}:{window} >= hourlyLimit`, **refuse** and return the start of the next window.
4. Otherwise `INCR` both counters (with a 2h TTL) and set `nextFreeSlot[sender] = slot + gap`.

Because it's one Lua call, it's atomic across any number of worker processes or machines. All state lives in Redis and none of it in memory.

What the worker does with the answer:
- **Slot is now** → claim and send.
- **Slot is in the future** (sender busy) → store `reservedSlot` in the job data, `job.moveToDelayed(slot)`, and update `scheduledAt` in the DB so the dashboard shows the real send time. When the job wakes up it already owns its slot and sends without asking again.
- **Hourly limit reached** → nothing is dropped or failed. The job is moved to `nextWindowStart + sequence` ms. The sequence offset keeps the original order when the whole batch wakes up next hour, and BullMQ processes delayed jobs in timestamp order. The DB row is marked `rateLimited` and shows a "Rate limited" pill in the UI.

Using `moveToDelayed` + `DelayedError` means these reschedules don't use up retry attempts.

**Slack on limit hit:** the first job that hits a sender or campaign limit in a given window sends the alert (deduped with `SET NX rl:notified:{key}:{window}`, so you get one message per limit per hour, not 990). The Slack connection is looked up from the DB on every alert, with no caching. Connecting or disconnecting takes effect immediately without a redeploy. If the user never connected Slack, nothing happens. Slack errors are caught and never fail a send. A webhook that returns 404/410 (app removed) gets its connection deleted.

### Behaviour under load (1000+ emails at the same time)
Tested by posting 1000 recipients at once with `delayMs=0` and `hourlyLimit=10`:
- The API call took ~3 s (one transaction + `addBulk` in chunks of 500).
- 10 emails were sent, spaced by the per-sender gap.
- The other 990 were moved to `09:00:00.010 … 09:00:00.999`, in their original order, still `SCHEDULED`, flagged `rateLimited`.
- One limit warning was logged (and one Slack message would have gone out).

In general, with N recipients due at once:
- Concurrency limits how many are processed in parallel. The per-sender gap spreads actual SMTP sends at `senders / gap` per second.
- Anything past the hourly budget (per sender *and* per campaign, whichever runs out first) rolls into the next hour window, and the one after that, until everything is sent.
- Nothing is held in memory. Restarting in the middle of this just carries on.

### Search (Elasticsearch)
- Index `emails` with `toEmail`, `subject`, `body` (text), plus `status`, `userId`, and dates as keyword/date fields.
- Indexed on create (bulk) and updated whenever the status changes (SENT / FAILED / rescheduled).
- The search box on both tabs calls `GET /api/emails?type=…&q=…`. It uses a `multi_match` `bool_prefix` query filtered by user and status. Results come back in relevance order and are then hydrated from Postgres.
- If Elasticsearch is down, search falls back to a Postgres `ILIKE` query and scheduling keeps working. The response's `source` field shows which one answered.

---

## 4. API

All `/api/*` routes except the auth/Slack callbacks need the session cookie (or `Authorization: Bearer <jwt>`).

| Method | Path | |
|---|---|---|
| GET | `/api/auth/google` | start Google login |
| GET | `/api/auth/google/callback` | OAuth callback |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/logout` | clear session |
| POST | `/api/emails/schedule` | schedule a batch |
| GET | `/api/emails?type=scheduled\|sent&q=&page=&limit=` | list / search |
| GET | `/api/emails/stats` | counts for the sidebar |
| GET | `/api/emails/:id` | one email |
| GET | `/api/senders` | Ethereal senders |
| GET | `/api/slack/connect-url` | Slack authorize URL (signed state) |
| GET | `/api/slack/callback` | Slack OAuth callback |
| GET | `/api/slack/status` | is Slack connected |
| POST | `/api/slack/test` | send a test message |
| DELETE | `/api/slack` | disconnect (also revokes the token) |
| GET | `/admin/queues` | Bull Board |

Example:

```bash
curl -X POST http://localhost:4000/api/emails/schedule \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "subject": "Hello",
    "body": "Hi there",
    "emails": ["a@example.com", "b@example.com"],
    "startAt": "2026-10-21T10:00:00Z",
    "delayMs": 2000,
    "hourlyLimit": 50
  }'
```

---

## 5. Features implemented

**Backend**
- [x] Express + TypeScript, Prisma + Postgres
- [x] BullMQ delayed jobs, no cron of any kind
- [x] Multiple Ethereal senders (auto-provisioned and persisted), round-robin assignment
- [x] Persistence across restarts (Redis AOF + boot-time reconcile from Postgres)
- [x] Idempotency (jobId = emailId, atomic DB claim, stable Message-ID)
- [x] Configurable worker concurrency
- [x] Min delay between sends per sender (Redis, atomic)
- [x] Hourly limits per sender (env) and per campaign (UI), Redis counters keyed by hour window, safe across instances
- [x] Over-limit jobs moved to the next window, in order, never dropped
- [x] Slack OAuth connect / disconnect / test, live alert when a limit is hit
- [x] Elasticsearch indexing + search with DB fallback
- [x] Bull Board at `/admin/queues`
- [x] Retries with exponential backoff, FAILED status after the last attempt
- [x] Graceful shutdown, API and worker can run as separate processes

**Frontend**
- [x] Real Google OAuth login. The header/sidebar shows name, email and avatar, plus Logout
- [x] Dashboard with Scheduled / Sent tabs and live counts
- [x] Compose: subject, body, CSV/TXT upload with detected-address count (deduped), manual entry / paste, delay between emails, hourly limit, Send Now, Send Later with a date-time picker and presets
- [x] Scheduled table: email, subject, scheduled time, status (+ "Rate limited" marker)
- [x] Sent table: email, subject, sent time, status (sent / failed)
- [x] Loading skeletons, empty states, error state with retry, toasts
- [x] Search (Elasticsearch), pagination, auto-refresh every 5s
- [x] Email detail page with an Ethereal preview link
- [x] Connect Slack card + link to the queue dashboard
- [x] Reusable components (Button, Input, Modal, StatusBadge, EmptyState, Avatar…), typed API layer

---

## 6. Assumptions, shortcuts & trade-offs
- **Figma:** I followed the provided layout (sidebar with user card, Compose button, Scheduled/Sent, list rows with status pills, a full compose page with a "Send Later" popover). Spacing and colours are close, but not pixel-matched.
- **Hour windows** are fixed clock hours (UTC), not a rolling 60 minutes. That's simpler and cheaper in Redis. The downside is you can get up to 2× the limit across a boundary (end of one hour + start of the next).
- **Campaign hourly limit** and **sender hourly limit** are both enforced; whichever is stricter wins.
- **Sender selection** is round-robin, not user-chosen. "From" on the compose page shows how many senders are rotating.
- **At-least-once in one edge case:** see Idempotency above.
- **Reconcile on boot** checks every pending email one by one. That's fine for thousands. For millions I'd pipeline the Redis calls or keep a "last enqueued" marker in the DB.
- **Slack** uses incoming webhooks (one channel per user, picked during OAuth). Tokens are stored in plain text in the DB. In production they'd be encrypted at rest.
- **Elasticsearch** is optional at runtime. If it's down, search uses Postgres and indexing is skipped (no backfill job yet).
- The Slack alert fires once per limit per hour window, deliberately, so a 1000-email batch doesn't spam the channel.
