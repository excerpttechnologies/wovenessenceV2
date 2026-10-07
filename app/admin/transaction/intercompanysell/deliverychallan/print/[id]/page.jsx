'use client';
import { use } from 'react';
import IcChallanPrintView from '@/components/IcChallanPrintView';

/* Print Delivery Challan - /admin/transaction/intercompanysell/deliverychallan/print/<id>
   Reached from the print icon on the Inter Company Delivery Challan list. */

export default function IcDeliveryChallanPrintPage({ params }) {
  const { id } = use(params);
  return <IcChallanPrintView id={id} />;
}
