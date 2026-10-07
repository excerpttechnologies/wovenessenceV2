'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Goods Return Notes */

export default function EditTransactionPurchaseGrtPage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Goods Return Notes",
        addTitle: "Edit Goods Return Notes",
        basePath: '/admin/',
        slugPath: "transaction/purchase/grt",
        endpoint: '/api/purchase-grt',
        scope: ["business","location","finYear"],
        docType: "GRT",
        form: FORM,
      }}
    />
  );
}
