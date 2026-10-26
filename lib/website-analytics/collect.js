/* Accept one storefront event.

   Order matters: rate-limit first, then validate consent/privacy, then write.
   No database connection is opened for a bot, a declined visitor, or an
   invalid payload. */

import dbConnect from '@/lib/db';
import WebsiteEvent from '@/models/WebsiteEvent';
import { clientIp, hashIp } from './privacy';
import { collectRateLimiter } from './rateLimit';
import { normaliseWebsiteEvent } from './validation';

export async function recordWebsiteEvent({ body, headers = {}, now = new Date() } = {}) {
  const ipHash = hashIp(clientIp(headers));
  const rate = collectRateLimiter.check(ipHash || 'anonymous');
  if (!rate.allowed) {
    return {
      outcome: 'rate_limited',
      status: 429,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const normalised = normaliseWebsiteEvent(body, { headers, now });
  if (!normalised.ok) {
    if (normalised.skipped) {
      return {
        outcome: 'skipped',
        status: 202,
        reason: normalised.skipped,
        message: normalised.reason,
      };
    }
    return { outcome: 'invalid', status: 422, error: normalised.error };
  }

  await dbConnect();

  try {
    await WebsiteEvent.create(normalised.event);
    return { outcome: 'created', status: 202 };
  } catch (err) {
    /* A retried sendBeacon is expected to collide. That is the dedupe
       working, not an error the browser should retry again. */
    if (err?.code === 11000) return { outcome: 'duplicate', status: 202 };
    if (err?.name === 'ValidationError') return { outcome: 'invalid', status: 422, error: 'invalid_event' };
    throw err;
  }
}
