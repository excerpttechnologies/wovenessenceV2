import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { handler, json } from '@/lib/apiError';
import { dashboardScope, scopeDescription } from '@/lib/dashboard/access';
import { resolveRange } from '@/lib/dashboard/range';
import { getWebsiteAnalytics } from '@/lib/website-analytics/service';
import { buildWebsiteAnalyticsCsv } from '@/lib/website-analytics/export';

/* /api/website-analytics/export

   The overview as CSV, from the same service call the screen makes. */

export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = dashboardScope(sp, session);

  let range;
  try {
    range = resolveRange({
      preset: sp.get('preset') || '30d',
      from: sp.get('from'),
      to: sp.get('to'),
      finYear: scope.finYear || sp.get('finYear') || '',
    });
  } catch (err) {
    if (err instanceof RangeError) {
      return json({ error: err.message, code: 'BAD_RANGE' }, 422);
    }
    throw err;
  }

  await dbConnect();
  const snapshot = await getWebsiteAnalytics(scope, range);
  const csv = '\uFEFF' + buildWebsiteAnalyticsCsv(snapshot);
  const filename = `website-analytics-${range.fromKey}-to-${range.toKey}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Website-Scope': scopeDescription(scope, session).locationId || 'all',
    },
  });
});
