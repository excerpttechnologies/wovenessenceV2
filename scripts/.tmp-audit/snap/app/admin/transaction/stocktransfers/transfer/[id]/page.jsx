'use client';
import { useParams } from 'next/navigation';
import StockTransferDetail from '@/components/StockTransferDetail';

/* One stock transfer: receiving, returns, taking returns back and billing.
   Which of those are offered is decided by the server from the viewer's
   role and location - see the `can` block in the detail route. */
export default function StockTransferDetailPage() {
  const { id } = useParams();
  return <StockTransferDetail id={id} />;
}
