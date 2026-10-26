import { requireSession } from '@/lib/session';
import { handler, json } from '@/lib/apiError';
import { dashboardScope, scopeDescription } from '@/lib/dashboard/access';
import { RANGE_PRESETS, describeRange, resolveRange } from '@/lib/dashboard/range';

/* /api/dashboard/options

   What the period picker needs, and nothing that depends on a document
   being present. Kept separate from /analytics so the controls can paint
   before the aggregates finish - the same reason the app's list screens
   have their own option endpoints. */

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
      finYear: scope.finYear,
    });
  } catch (err) {
    if (err instanceof RangeError) {
      return json({ error: err.message, code: 'BAD_RANGE' }, 422);
    }
    throw err;
  }

  return json({
    presets: RANGE_PRESETS,
    defaultPreset: '30d',
    range: describeRange(range),
    scope: scopeDescription(scope, session),
    timezone: 'Asia/Kolkata',
    maxDays: 366,
  });
});
