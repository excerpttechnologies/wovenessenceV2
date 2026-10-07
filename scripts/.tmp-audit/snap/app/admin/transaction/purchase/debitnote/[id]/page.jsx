'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Debit Notes */

export default function EditTransactionPurchaseDebitnotePage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Debit Notes",
        addTitle: "Edit Debit Notes",
        basePath: '/admin/',
        slugPath: "transaction/purchase/debitnote",
        endpoint: '/api/purchase-debitnote',
        scope: ["business","location","finYear"],
        docType: "Debit Note",
        form: FORM,
      }}
    />
  );
}
