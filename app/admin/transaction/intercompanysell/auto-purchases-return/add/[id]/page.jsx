'use client';
import { use } from 'react';
import IcChallanForm from '@/components/IcChallanForm';
// import { FIELDS, SHOW_INFO } from '../fields';

import { FIELDS, SHOW_INFO } from '../../fields';

/* Edit Inter Company Auto Purchases Return.
   Locked once the destination branch has accepted it as a Sales Return -
   the API returns 409 and the form surfaces the message. */

export default function EditIcAutoPurchaseReturnPage({ params }) {
  const { id } = use(params);
  return (
    <IcChallanForm
      id={id}
      cfg={{
        title: 'Auto Purchases Returns',
        addTitle: 'Inter Company Auto Purchases Return',
        basePath: '/admin/transaction/intercompanysell/',
        slugPath: 'auto-purchases-return',
        endpoint: '/api/ic-auto-purchase-return',
        scope: ['business', 'location', 'finYear'],
        docType: 'Inter Company Sales Return',
        fields: FIELDS,
        showInfo: SHOW_INFO,
        docNoKey: 'returnNo',
        docNoLabel: 'Return No',
      }}
    />
  );
}
