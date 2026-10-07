'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Sales Invoices */

export default function EditTransactionSellSalesinvoicePage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Sales Invoices",
        addTitle: "Edit Sales Invoices",
        basePath: '/admin/',
        slugPath: "transaction/sell/salesinvoice",
        endpoint: '/api/sell-salesinvoice',
        scope: ["business","location","finYear"],
        docType: "Sales Invoice",
        form: FORM,
      }}
    />
  );
}
