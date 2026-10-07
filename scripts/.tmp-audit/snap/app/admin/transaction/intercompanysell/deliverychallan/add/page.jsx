'use client';
import IcChallanForm from '@/components/IcChallanForm';

/* Add Inter Company Delivery Challan.
   DC No is issued by the server on save from the Doc Setup master, so it is
   not on this form - it appears readonly on the edit screen. */

export default function AddIcDeliveryChallanPage() {
  return (
    <IcChallanForm
      cfg={{
        title: 'Inter Company Delivery Challans',
        addTitle: 'Inter Company Delivery Challan',
        basePath: '/admin/transaction/intercompanysell/',
        slugPath: 'deliverychallan',
        endpoint: '/api/ic-delivery-challan',
        scope: ['business', 'location', 'finYear'],
        docType: 'Inter Company Delivery Challan',
      }}
    />
  );
}
