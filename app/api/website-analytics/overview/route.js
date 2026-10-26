import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { handler, json } from '@/lib/apiError';
import { dashboardScope, scopeDescription } from '@/lib/dashboard/access';
import { resolveRange } from '@/lib/dashboard/range';
import { getWebsiteAnalytics } from '@/lib/website-analytics/service';

/* /api/website-analytics/overview

   GET ?business=&location=&finYear=&preset=&from=&to=

   Website traffic and conversion for the selected period.

   Missing tracking is reported as null metrics, never as zero: a site with
   no tag and a site with no visitors need different fixes, and the screen
   turns the two into different messages. */

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

  return json({
    ...snapshot,
    scope: scopeDescription(scope, session),
    timezone: 'Asia/Kolkata',
  });
});
