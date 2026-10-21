'use client';
import { useParams } from 'next/navigation';
import SellChallanView from '@/components/SellChallanView';

/* Printed Delivery Challan, in either the detailed or the non-detailed
   format. The toggle is on the screen; both come from the same document. */
export default function SellChallanPage() {
  const { id } = useParams();
  return <SellChallanView id={id} />;
}
