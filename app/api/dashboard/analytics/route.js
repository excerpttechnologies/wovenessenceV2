import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import dbConnect from '@/lib/db';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
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
    await dbConnect();
    const denied = await screenDenial({
      session,
      screen: SCREENS.DASHBOARD,
      action: PERM.READ,
      businessId: sp.get('business') || sp.get('businessId'),
      label: 'the dashboard',
    });
    if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403, headers: HEADERS });
    const data = await buildDashboardAnalytics(session, sp);
    return Response.json(data, { headers: HEADERS });
  } catch (err) {
    return fail(err);
  }
}
