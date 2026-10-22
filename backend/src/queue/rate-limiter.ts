import { redis } from '../lib/redis';
import { env } from '../config/env';

const P = `${env.QUEUE_PREFIX}:rl`;

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Atomic slot reservation (one Lua call, so it's safe across any number of
 * workers / processes):
 *
 *  1. slot = max(now, next free slot for this sender)   -> min gap between sends
 *  2. look at the hour window that slot falls in
 *  3. if the sender or the campaign already used up that window -> refuse,
 *     return start of next window so the caller can push the job there
 *  4. otherwise bump both counters and move the sender's next free slot by `gap`
 *
 * KEYS[1] = sender "next free slot" key
 * ARGV    = now, gap, senderLimit, campaignLimit, senderId, campaignId, keyPrefix
 * returns { slot, count, reason }   reason: 0 ok, 1 sender limit, 2 campaign limit
 */
const RESERVE_LUA = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local senderLimit = tonumber(ARGV[3])
local campaignLimit = tonumber(ARGV[4])
local hour = ${HOUR_MS}

local nextFree = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = math.max(now, nextFree)
local window = math.floor(slot / hour)

local senderKey = ARGV[7] .. ':sender:' .. ARGV[5] .. ':' .. window
local campaignKey = ARGV[7] .. ':campaign:' .. ARGV[6] .. ':' .. window

local sentBySender = tonumber(redis.call('GET', senderKey) or '0')
if sentBySender >= senderLimit then
  return { (window + 1) * hour, sentBySender, 1 }
end

if campaignLimit > 0 then
  local sentByCampaign = tonumber(redis.call('GET', campaignKey) or '0')
  if sentByCampaign >= campaignLimit then
    return { (window + 1) * hour, sentByCampaign, 2 }
  end
  redis.call('INCR', campaignKey)
  redis.call('PEXPIRE', campaignKey, hour * 2)
end

redis.call('INCR', senderKey)
redis.call('PEXPIRE', senderKey, hour * 2)
redis.call('SET', KEYS[1], slot + gap, 'PX', gap + hour)

return { slot, sentBySender + 1, 0 }
`;

export type LimitReason = 'sender' | 'campaign';

export type Reservation =
  | { ok: true; slot: number; count: number }
  | { ok: false; reason: LimitReason; nextWindowStart: number; count: number };

export async function reserveSendSlot(params: {
  senderId: string;
  campaignId: string;
  senderLimit: number;
  campaignLimit: number;
  gapMs: number;
  now?: number;
}): Promise<Reservation> {
  const now = params.now ?? Date.now();
  const [slot, count, reason] = (await redis.eval(
    RESERVE_LUA,
    1,
    `${P}:next:${params.senderId}`,
    now,
    params.gapMs,
    params.senderLimit,
    params.campaignLimit,
    params.senderId,
    params.campaignId,
    P,
  )) as [number, number, number];

  if (reason === 0) return { ok: true, slot, count };
  return {
    ok: false,
    reason: reason === 1 ? 'sender' : 'campaign',
    nextWindowStart: slot,
    count,
  };
}

/** true only for the first caller per key+window, used to notify once per hour */
export async function firstHitInWindow(key: string, windowStart: number) {
  const res = await redis.set(`${P}:notified:${key}:${windowStart}`, '1', 'PX', HOUR_MS * 2, 'NX');
  return res === 'OK';
}
