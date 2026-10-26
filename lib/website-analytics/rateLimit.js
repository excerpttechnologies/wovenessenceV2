/* A small in-process limiter for the public collection endpoint.

   This is abuse protection, not security: serverless instances do not share
   memory, so a distributed attacker can still spread requests. It stops a
   single runaway tracker or a naive script from filling the collection, and
   it costs no extra infrastructure. The key is the salted IP hash, never the
   IP itself. */

export function createRateLimiter({ windowMs = 60000, max = 180, maxKeys = 10000 } = {}) {
  const buckets = new Map();

  const prune = (now, keepKey) => {
    for (const [key, bucket] of buckets) {
      if (bucket.reset <= now) buckets.delete(key);
    }
    /* Expiry alone does not bound memory when many new addresses arrive
       inside one window. Drop the oldest buckets, never the one being
       checked, so a burst cannot grow the map without limit. */
    while (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined || oldest === keepKey) break;
      buckets.delete(oldest);
    }
  };

  return {
    check(key, now = Date.now()) {
      const cleanKey = String(key || 'unknown');
      let bucket = buckets.get(cleanKey);
      if (!bucket || bucket.reset <= now) {
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(cleanKey, bucket);
        if (buckets.size >= maxKeys) prune(now, cleanKey);
      }
      bucket.count += 1;
      const allowed = bucket.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - bucket.count),
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
      };
    },
    reset() {
      buckets.clear();
    },
    get size() {
      return buckets.size;
    },
  };
}

export const collectRateLimiter = createRateLimiter({ windowMs: 60000, max: 180 });
