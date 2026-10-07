'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Debit Note */

export default function AddTransactionPurchaseDebitnotePage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Debit Notes",
        addTitle: "Debit Note",
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
