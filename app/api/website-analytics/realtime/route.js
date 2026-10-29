import { analyticsGet, analyticsMeta } from '@/lib/website-analytics/http';
import { loadGa4Analytics } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* The realtime card polls this route at most once a minute. It intentionally
   does not read standard reports, so polling it cannot refresh the whole
   dashboard or burn the standard-report quota. */
export const GET = analyticsGet(async ({ sp }) => {
  const branch = String(sp.get('branch') || '').trim();
  if (branch) {
    return {
      meta: { generatedAt: new Date().toISOString(), windowMinutes: 30 },
      ga4: {
        configured: true,
        status: 'GA4_UNAVAILABLE',
        message: 'GA4 realtime data is property-wide and cannot be narrowed to a branch. Select the all-branch view.',
        realtime: { available: false, activeUsers: null, events: null, topEvents: [] },
      },
    };
  }

  const ga4 = await loadGa4Analytics({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    force: sp.get('refresh') === '1',
    sections: ['realtime'],
  });

  return {
    meta: { generatedAt: new Date().toISOString(), windowMinutes: 30 },
    ga4,
    realtime: ga4.realtime || null,
  };
});
