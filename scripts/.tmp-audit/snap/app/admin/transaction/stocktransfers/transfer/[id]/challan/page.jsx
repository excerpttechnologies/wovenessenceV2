'use client';
import { useParams } from 'next/navigation';
import TransferChallanView from '@/components/TransferChallanView';

/* Delivery Challan for a stock transfer, in either the detailed or the
   non-detailed format - the toggle is on the screen, both come from the same
   document. */
export default function TransferChallanPage() {
  const { id } = useParams();
  return <TransferChallanView id={id} />;
}
