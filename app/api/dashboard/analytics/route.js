import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { handler, json } from '@/lib/apiError';
import { dashboardScope, scopeDescription } from '@/lib/dashboard/access';
import { resolveRange } from '@/lib/dashboard/range';
import { getDashboardAnalytics } from '@/lib/dashboard/analytics';

/* /api/dashboard/analytics

   GET ?business=&location=&finYear=&preset=&from=&to=

   The dashboard's aggregates. Read-only, and scoped to the locations the
   signed-in account is actually assigned to - dashboardScope() refuses a
   location the account does not hold rather than quietly widening the query.

   The legacy /api/dashboard route is left in place: existing links and any
   other screen reading its {tiles,last30,byMonth} shape keep working. This
   route is the richer feed the new screen uses. */

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

  const snapshot = await getDashboardAnalytics(scope, range);

  return json({
    ...snapshot,
    scope: scopeDescription(scope, session),
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });
});
