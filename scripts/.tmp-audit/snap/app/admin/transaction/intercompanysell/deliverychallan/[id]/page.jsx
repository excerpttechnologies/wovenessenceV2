'use client';
import { use } from 'react';
import IcChallanForm from '@/components/IcChallanForm';

/* Edit Inter Company Delivery Challan.

   The deployed app routes this as /deliverychallan/edit/518. This project
   addresses a record as /<slug>/<id> everywhere else, so the route is
   /admin/transaction/intercompanysell/deliverychallan/<id> - same shape as
   Purchase Invoice, Sales Invoice and every master. */

export default function EditIcDeliveryChallanPage({ params }) {
  const { id } = use(params);
  return (
    <IcChallanForm
      id={id}
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
