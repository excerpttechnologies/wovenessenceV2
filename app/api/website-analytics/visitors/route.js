import { analyticsGet, analyticsMeta } from '@/lib/website-analytics/http';
import { loadGa4Analytics } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* GA4 visitor metrics for the selected period. The main overview embeds the
   same payload; this route exists for callers that only need visitor data. */
export const GET = analyticsGet(async ({ period, refresh }) => {
  const ga4 = await loadGa4Analytics({
    startDate: period.range.start,
    endDate: period.range.end,
    comparisonStartDate: period.comparison?.start || null,
    comparisonEndDate: period.comparison?.end || null,
    force: refresh,
    sections: ['totals', 'newVsReturning', 'logins'],
  });

  return {
    meta: analyticsMeta(period, { websiteUrl: ga4.websiteUrl, ga4Status: ga4.status }),
    ga4,
    visitors: ga4.totals || null,
  };
});
