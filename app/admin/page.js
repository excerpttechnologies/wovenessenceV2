import { requireSession } from '@/lib/session';
import DashboardClient from '@/components/dashboard/DashboardClient';

export const metadata = {
  title: 'Retail Saree & Fabric Business · AI-Powered Sales Report',
  description: 'Filtered sales analytics for the four retail boutiques.',
};

export default async function DashboardPage() {
  await requireSession();
  return <DashboardClient />;
}
