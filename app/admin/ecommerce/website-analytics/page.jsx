'use client';

import RealtimeDashboard from '@/components/website-analytics/RealtimeDashboard';

/* E-commerce → Website Analytics.

   Read-only, GA4 only. Two reports share the screen:

     - Active Users: runReport for a date range the operator chooses
     - Realtime overview / Realtime pages: runRealtimeReport for the last 30
       minutes, served by one overview response

   Both routes enforce the existing reports.view permission. Nothing here reads
   an ERP or storefront collection, and nothing is written back to GA4. */

export default function WebsiteAnalyticsPage() {
  return <RealtimeDashboard />;
}
