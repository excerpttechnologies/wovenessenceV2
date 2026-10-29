import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { loadGa4Realtime } from '@/lib/website-analytics/ga4';

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
  console.error('[website-analytics/overview]', err?.code || 'ERROR');
  return Response.json(
    { error: 'Could not load website analytics. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: PRIVATE_HEADERS }
  );
}

/* One request, one response. Every panel on the screen reads this payload, so
   the cards and the tables can never show two different reporting windows.

   This route reads GA4 realtime only (properties/:id:runRealtimeReport). No ERP
   or storefront collection is queried and no standard runReport is used: the
   page covers the last 30 minutes and nothing older.

   Authentication and the reports.view permission are unchanged. */
export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const force = new URL(req.url).searchParams.get('refresh') === '1';
    const data = await loadGa4Realtime({ force });
    return Response.json(data, { headers: PRIVATE_HEADERS });
  } catch (err) {
    return fail(err);
  }
}
