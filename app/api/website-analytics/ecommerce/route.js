import { analyticsGet, analyticsMeta } from '@/lib/website-analytics/http';
import { loadGa4Analytics } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* GA4 ecommerce view. Backend order/revenue records are authoritative and are
   returned by /api/website-analytics/overview; this route deliberately does
   not duplicate them so a caller cannot mistake GA4 item revenue for a ledger. */
export const GET = analyticsGet(async ({ period, refresh }) => {
  const ga4 = await loadGa4Analytics({
    startDate: period.range.start,
    endDate: period.range.end,
    comparisonStartDate: period.comparison?.start || null,
    comparisonEndDate: period.comparison?.end || null,
    force: refresh,
    sections: ['totals', 'products', 'funnel'],
  });

  return {
    meta: analyticsMeta(period, { websiteUrl: ga4.websiteUrl, ga4Status: ga4.status }),
    ga4,
    totals: ga4.totals || null,
    products: ga4.products || null,
    funnel: ga4.funnel || null,
  };
});
