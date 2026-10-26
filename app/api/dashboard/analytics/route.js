import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { buildDashboardAnalytics } from '@/lib/dashboard/service';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

function fail(err) {
  if (err && err.status && err.message) {
    return Response.json(
      { error: err.message, code: err.code || 'ERROR', field: err.field || undefined },
      { status: err.status, headers: HEADERS }
    );
  }
  console.error('[dashboard/analytics]', err);
  return Response.json(
    { error: 'Could not load sales analytics. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: HEADERS }
  );
}

/* Every response is built from the caller's session and query string, is
   scoped to the caller's locations, and is explicitly non-cacheable. */
export async function GET(req) {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = new URL(req.url).searchParams;
    const data = await buildDashboardAnalytics(session, sp);
    return Response.json(data, { headers: HEADERS });
  } catch (err) {
    return fail(err);
  }
}
