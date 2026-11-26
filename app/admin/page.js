import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { ROLES } from '@/models/User';
import DashboardClient from '@/components/dashboard/DashboardClient';

export const metadata = {
  title: 'Retail Saree & Fabric Business · AI-Powered Sales Report',
  description: 'Filtered sales analytics for the four retail boutiques.',
};

export default async function DashboardPage() {
  const session = await requireSession();
  if (session?.role === ROLES.CASHIER) {
    redirect('/admin/transaction/sell/pos');
  }
  return <DashboardClient />;
}
