import { analyticsGet, analyticsMeta } from '@/lib/website-analytics/http';
import { loadGa4Analytics } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = analyticsGet(async ({ period, refresh }) => {
  const ga4 = await loadGa4Analytics({
    startDate: period.range.start,
    endDate: period.range.end,
    force: refresh,
    sections: ['funnel'],
  });

  return {
    meta: analyticsMeta(period, { websiteUrl: ga4.websiteUrl, ga4Status: ga4.status }),
    ga4,
    funnel: ga4.funnel || null,
  };
});
