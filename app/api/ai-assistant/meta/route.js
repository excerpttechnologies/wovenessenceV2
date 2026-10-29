import { PERMISSIONS, requirePermission } from '@/lib/rbac';
import { assistantMeta } from '@/lib/ai-assistant/orchestrator';
import { rateLimitStatus } from '@/lib/ai-assistant/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

/* What the assistant can see and how it is configured - for the filter chips,
   the suggested questions and the "AI reasoning" badge. It deliberately says
   whether an AI provider is configured, so the interface never claims live AI
   when the deterministic layer is answering. */
export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const meta = await assistantMeta(session);
    const key = String(session.id || session.email || 'anonymous');
    return Response.json({
      ...meta,
      rateLimit: rateLimitStatus(`ai-chat:${key}`, { limit: 20 }),
    }, { headers: HEADERS });
  } catch (err) {
    if (err?.status && err.message) {
      return Response.json({ error: err.message, code: err.code || 'ERROR' },
        { status: err.status, headers: HEADERS });
    }
    console.error('[ai-assistant/meta]', err);
    return Response.json({ error: 'Could not load the assistant configuration.', code: 'INTERNAL' },
      { status: 500, headers: HEADERS });
  }
}
