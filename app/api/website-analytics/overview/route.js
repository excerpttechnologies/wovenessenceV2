import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { buildWebsiteAnalytics } from '@/lib/website-analytics/service';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

function fail(err) {
  if (err && err.status && err.message) {
    return Response.json(
      { error: err.message, code: err.code || 'ERROR', field: err.field || undefined },
      { status: err.status, headers: PRIVATE_HEADERS }
    );
  }
  console.error('[website-analytics/overview]', err);
  return Response.json(
    { error: 'Could not load website analytics. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: PRIVATE_HEADERS }
  );
}

/* One request, one response: every panel on the screen reads this payload, so
   the page cannot show two panels computed from different ranges. */
export async function GET(req) {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = new URL(req.url).searchParams;
    const data = await buildWebsiteAnalytics(session, sp);
    return Response.json(data, { headers: PRIVATE_HEADERS });
  } catch (err) {
    return fail(err);
  }
}
