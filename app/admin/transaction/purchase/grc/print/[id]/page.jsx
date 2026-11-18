'use client';

import { useParams } from 'next/navigation';
import GrcPrintView from '@/components/GrcPrintView';

/* GRC Print - /admin/transaction/purchase/grc/print/<id>

   Reached from the Action menu on the Goods Receipt Challan list. It renders
   the one GRC document layout (components/GrcPrintView.jsx), the same one the
   GRC edit screen's Print GRC button opens. */

export default function GrcPrintPage() {
  const { id } = useParams();
  return <GrcPrintView id={id} />;
}
