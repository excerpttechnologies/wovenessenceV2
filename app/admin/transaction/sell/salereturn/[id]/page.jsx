'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Sales Returns */

export default function EditTransactionSellSalereturnPage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Sales Returns",
        addTitle: "Edit Sales Returns",
        basePath: '/admin/',
        slugPath: "transaction/sell/salereturn",
        endpoint: '/api/sell-salereturn',
        scope: ["business","location","finYear"],
        docType: "Sales Return",
        form: FORM,
      }}
    />
  );
}
