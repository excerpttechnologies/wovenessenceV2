import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { analyticsFailure, PRIVATE_HEADERS } from '@/lib/website-analytics/http';
import { AnalyticsError } from '@/lib/website-analytics/period';
import { loadGa4ActiveUsers } from '@/lib/website-analytics/ga4';
import { addDays, todayInIndia } from '@/lib/dashboard/date';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ==========================================================================
   GET /api/website-analytics/active-users

   Active users for a date range the operator picks. This is the only dated
   report in the section: it reads GA4 runReport, while the realtime screens
   keep reading runRealtimeReport.

   Presets are resolved here, from today in Asia/Kolkata, so the browser and
   the server can never disagree about what "Last 7 days" means. Every param
   is checked against an allow-list before any date reaches Google.
   ========================================================================== */

const PRESETS = new Set([
  'today', 'yesterday', 'last_7', 'last_30', 'last_90',
  'this_month', 'last_month', 'custom',
]);

function presetRange(preset, today) {
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { start: day, end: day };
    }
    case 'last_7':
      return { start: addDays(today, -6), end: today };
    case 'last_90':
      return { start: addDays(today, -89), end: today };
    case 'this_month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'last_month': {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = addDays(firstOfThis, -1);
      return { start: `${lastOfPrev.slice(0, 7)}-01`, end: lastOfPrev };
    }
    case 'last_30':
      return { start: addDays(today, -29), end: today };
    default:
      throw new AnalyticsError(422, `preset must be one of ${[...PRESETS].join(', ')}.`, {
        code: 'GA4_INVALID_REQUEST',
        field: 'preset',
      });
  }
}

function resolveFilters(sp) {
  const today = todayInIndia();
  const rawPreset = String(sp.get('preset') || '').trim();
  const rawStart = String(sp.get('startDate') || '').trim();
  const rawEnd = String(sp.get('endDate') || '').trim();

  if (rawPreset && !PRESETS.has(rawPreset)) {
    throw new AnalyticsError(422, `preset must be one of ${[...PRESETS].join(', ')}.`, {
      code: 'GA4_INVALID_REQUEST',
      field: 'preset',
    });
  }

  const preset = rawPreset || (rawStart || rawEnd ? 'custom' : 'last_30');

  if (preset === 'custom') {
    if (!rawStart || !rawEnd) {
      throw new AnalyticsError(
        422,
        'startDate and endDate are required for a custom range.',
        { code: 'GA4_INVALID_REQUEST', field: rawStart ? 'endDate' : 'startDate' }
      );
    }
    return { preset, startDate: rawStart, endDate: rawEnd };
  }

  const range = presetRange(preset, today);
  return { preset, startDate: range.start, endDate: range.end };
}

export async function GET(req) {
  try {
    /* Same guard as every other Website Analytics route: reports.view. */
    await requirePermission(PERMISSIONS.REPORTS_VIEW);

    const sp = new URL(req.url).searchParams;
    const { preset, startDate, endDate } = resolveFilters(sp);

    /* Values are passed through raw so the data layer can reject anything that
       is not an allow-listed option with a 422 before Google is called. */
    const granularity = sp.get('granularity') === null ? 'day' : String(sp.get('granularity')).trim();
    const compare = sp.get('compare') === null ? 'none' : String(sp.get('compare')).trim();

    const data = await loadGa4ActiveUsers({
      startDate,
      endDate,
      preset,
      granularity,
      compare,
      force: sp.get('refresh') === '1',
    });

    return Response.json(data, { headers: PRIVATE_HEADERS });
  } catch (err) {
    return analyticsFailure(err);
  }
}
