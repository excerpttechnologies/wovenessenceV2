import DashboardClient from '@/components/dashboard/DashboardClient';

/* The dashboard is a client screen: every figure depends on the business /
   location / financial-year selectors in the top bar, and the period picker
   re-reads on change. The data itself comes from /api/dashboard/analytics;
   the legacy /api/dashboard endpoint is left untouched for existing links. */

export const metadata = {
  title: 'Dashboard \u00b7 Retail ERP',
};

export default function DashboardPage() {
  return <DashboardClient />;
}
