import WebsiteAnalyticsClient from '@/components/website-analytics/WebsiteAnalyticsClient';

/* E-commerce -> Website Analytics.

   The screen reads /api/website-analytics/overview; nothing is rendered on
   the server because every figure is scoped by the top-bar selectors. */

export const metadata = {
  title: 'Website Analytics \u00b7 Retail ERP',
};

export default function WebsiteAnalyticsPage() {
  return <WebsiteAnalyticsClient />;
}
