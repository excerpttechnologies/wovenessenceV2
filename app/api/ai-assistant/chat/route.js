import { requireSession } from '@/lib/session';
import { PERMISSIONS, requirePermission } from '@/lib/rbac';
import { answerQuestion } from '@/lib/ai-assistant/orchestrator';
import { rateLimit, recordAudit } from '@/lib/ai-assistant/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 200 * 1024;
const RATE_LIMIT = 20;
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

function fail(err) {
  const status = err && err.status && err.message ? err.status : 500;
  if (status >= 500) console.error('[ai-assistant/chat]', err);
  return Response.json(
    {
      error: status >= 500
        ? 'The assistant could not complete that request. Please retry.'
        : err.message,
      code: err?.code || (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
    },
    { status, headers: HEADERS }
  );
}

/* One question, one answer. The response is a Server-Sent Event stream so the
   interface can show which stage it is in (authorising, reading data, writing)
   while a multi-query answer is being assembled. Clients that cannot stream -
   or that explicitly ask for JSON - get the identical payload as JSON.

   Authentication is the existing session cookie. Authorisation is
   reports.view, the same permission every analytics screen uses; the scope is
   derived from the session inside the orchestrator, never from the body. */
export async function POST(req) {
  const startedAt = Date.now();
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: 'Sign in to use the business assistant.', code: 'UNAUTHENTICATED' },
      { status: 401, headers: HEADERS });
  }
  /* AuthzError carries its own status; without this catch Next would turn a
     403 into an opaque 500. */
  try {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);
  } catch (err) {
    return fail(err);
  }

  const key = String(session.id || session.email || 'anonymous');
  const limit = rateLimit(`ai-chat:${key}`, { limit: RATE_LIMIT });
  if (!limit.allowed) {
    return Response.json(
      { error: `Too many questions. Try again in ${limit.retryAfterSeconds} seconds.`, code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...HEADERS,
          'Retry-After': String(limit.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) {
      return Response.json({ error: 'That request is too large.', code: 'BODY_TOO_LARGE' },
        { status: 413, headers: HEADERS });
    }
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ error: 'Send a JSON body with a question.', code: 'INVALID_BODY' },
      { status: 400, headers: HEADERS });
  }

  const question = String(body.question || '').trim();
  if (!question) {
    return Response.json({ error: 'Ask a question about your business.', code: 'EMPTY_QUESTION' },
      { status: 422, headers: HEADERS });
  }

  const wantsStream = body.stream !== false
    && String(req.headers.get('accept') || '').includes('text/event-stream');

  const audit = (payload, error) => recordAudit({
    userId: session.id,
    role: session.role,
    questionType: payload?.questionType || body?.context?.questionType || '',
    tools: payload?.metadata?.tools || [],
    mode: payload?.metadata?.reasoning?.mode || 'deterministic',
    ok: !error,
    durationMs: Date.now() - startedAt,
    period: payload?.metadata?.period || null,
    filters: payload?.metadata?.filters || null,
    errorCode: error?.code || '',
  });

  if (!wantsStream) {
    try {
      const payload = await answerQuestion({
        session,
        question,
        history: body.history,
        context: body.context,
        requestedFilters: body.filters,
      });
      audit(payload, null);
      return Response.json(payload, {
        headers: { ...HEADERS, 'X-RateLimit-Remaining': String(limit.remaining) },
      });
    } catch (err) {
      audit(null, err);
      return fail(err);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        send('status', { stage: 'received', message: 'Question received' });
        const payload = await answerQuestion({
          session,
          question,
          history: body.history,
          context: body.context,
          requestedFilters: body.filters,
          onProgress: (progress) => send('status', progress),
        });
        send('result', payload);
        audit(payload, null);
      } catch (err) {
        const status = err?.status && err.message ? err.status : 500;
        if (status >= 500) console.error('[ai-assistant/chat] stream', err);
        send('error', {
          error: status >= 500
            ? 'The assistant could not complete that request. Please retry.'
            : err.message,
          code: err?.code || (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
          status,
        });
        audit(null, err);
      } finally {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-RateLimit-Remaining': String(limit.remaining),
      Vary: 'Cookie',
    },
  });
}
