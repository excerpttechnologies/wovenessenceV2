'use client';

import WebsiteAnalyticsClient from '@/components/website-analytics/WebsiteAnalyticsClient';

/* E-commerce → Website Analytics.

   Read-only. The figures come from the storefront collections that share this
   database (visits, orders, customers, carts) and, once installed, from the
   first-party tracker feed. Nothing here writes to a storefront or ERP record.
   Access is enforced by the overview/export APIs through the existing
   reports.view permission. */

export default function WebsiteAnalyticsPage() {
  return <WebsiteAnalyticsClient />;
}
