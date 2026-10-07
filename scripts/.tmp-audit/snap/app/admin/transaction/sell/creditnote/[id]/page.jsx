'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Credit Notes */

export default function EditTransactionSellCreditnotePage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Credit Notes",
        addTitle: "Edit Credit Notes",
        basePath: '/admin/',
        slugPath: "transaction/sell/creditnote",
        endpoint: '/api/sell-creditnote',
        scope: ["business","location","finYear"],
        docType: "Credit Note",
        form: FORM,
      }}
    />
  );
}
