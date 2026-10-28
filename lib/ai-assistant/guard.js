/* Rate limiting and audit logging.

   Kept in-process on purpose. This project runs as a single Next.js server and
   has no Redis or queue; adding one for a 20-request-per-minute guard would be
   a bigger dependency than the feature. The trade is explicit: the bucket is
   per process, so a horizontally scaled deployment would allow the limit per
   instance. The audit trail is also in-memory, and therefore lost on restart -
   the ERP's real audit records are the transaction documents themselves.

   What is recorded is deliberately thin: who (account id and role, never the
   email), what was asked about (question type, tools, period), whether it
   worked, and how long it took. Full questions are NOT written to logs, since
   they can contain customer questions and are not needed to operate the
   service.
   ========================================================================== */

const WINDOW_MS = 60000;
const DEFAULT_LIMIT = 20;
const AUDIT_MAX = 200;

const buckets = new Map();
const auditBuffer = [];

function prune(now) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key, { limit = DEFAULT_LIMIT, windowMs = WINDOW_MS } = {}) {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function rateLimitStatus(key, { limit = DEFAULT_LIMIT } = {}) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return { remaining: limit, retryAfterSeconds: 0 };
  return {
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)),
  };
}

export function recordAudit(entry) {
  const record = {
    at: new Date().toISOString(),
    userId: entry.userId ? String(entry.userId) : '',
    role: entry.role || '',
    questionType: entry.questionType || '',
    tools: Array.isArray(entry.tools)
      ? entry.tools.map((tool) => ({ name: tool.name, ok: tool.ok !== false }))
      : [],
    mode: entry.mode || 'deterministic',
    ok: entry.ok !== false,
    durationMs: Number(entry.durationMs) || 0,
    period: entry.period || null,
    filters: entry.filters || null,
    errorCode: entry.errorCode || '',
  };

  auditBuffer.push(record);
  if (auditBuffer.length > AUDIT_MAX) auditBuffer.shift();

  try {
    console.info('[ai-assistant]', JSON.stringify(record));
  } catch {
    /* Logging must never take the request down. */
  }

  return record;
}

/* Only used by the test script; not exposed over HTTP. */
export function recentAudit() {
  return auditBuffer.slice();
}
