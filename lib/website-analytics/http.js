import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { resolveAnalyticsPeriod } from './period';

/* ==========================================================================
   Shared HTTP boundary for the Website Analytics section routes.

   Every handler resolves the session, permission and reporting period in the
   same order. A section route therefore cannot accidentally accept a wider
   date range or skip the reports.view check that the main overview enforces.
   ========================================================================== */

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

export function analyticsFailure(err) {
  if (err && err.status && err.message) {
    return Response.json(
      {
        error: err.message,
        code: err.code || 'ERROR',
        field: err.field || undefined,
      },
      { status: err.status, headers: PRIVATE_HEADERS }
    );
  }
  console.error('[website-analytics]', err);
  return Response.json(
    { error: 'Could not load website analytics. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: PRIVATE_HEADERS }
  );
}

/**
 * Wrap a GET handler with authentication, permission and period resolution.
 *
 * @param {(context: {
 *   req: Request,
 *   sp: URLSearchParams,
 *   session: object,
 *   period: ReturnType<typeof resolveAnalyticsPeriod>,
 *   refresh: boolean,
 * }) => Promise<object>} handler
 */
export function analyticsGet(handler) {
  return async function GET(req) {
    try {
      const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
      const sp = new URL(req.url).searchParams;
      const period = resolveAnalyticsPeriod(sp);
      const refresh = sp.get('refresh') === '1';
      const payload = await handler({ req, sp, session, period, refresh });
      return Response.json(payload, { headers: PRIVATE_HEADERS });
    } catch (err) {
      return analyticsFailure(err);
    }
  };
}

export function analyticsMeta(period, extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    startDate: period.range.start,
    endDate: period.range.end,
    days: period.days,
    preset: period.preset,
    periodLabel: period.periodLabel,
    comparisonKind: period.comparisonKind,
    comparison: period.comparison
      ? {
        startDate: period.comparison.start,
        endDate: period.comparison.end,
        label: period.comparison.label,
      }
      : null,
    ...extra,
  };
}
