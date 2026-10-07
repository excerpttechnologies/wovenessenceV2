'use client';
import IcChallanForm from '@/components/IcChallanForm';
import { FIELDS, SHOW_INFO } from '../fields';

/* Add Inter Company Auto Purchases Return.
   Return No is issued by the server on save from the Doc Setup master. */

export default function AddIcAutoPurchaseReturnPage() {
  return (
    <IcChallanForm
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
