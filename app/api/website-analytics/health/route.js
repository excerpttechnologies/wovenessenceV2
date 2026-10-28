import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { analyticsFailure, PRIVATE_HEADERS } from '@/lib/website-analytics/http';
import { loadGa4Health } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Operator-facing connection check. It reads only a tiny report for today plus
   property metadata, and never exposes credentials. */
export async function GET(req) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = new URL(req.url).searchParams;
    const health = await loadGa4Health({ force: sp.get('refresh') === '1' });
    return Response.json(
      { meta: { generatedAt: new Date().toISOString() }, health },
      { headers: PRIVATE_HEADERS }
    );
  } catch (err) {
    return analyticsFailure(err);
  }
}
