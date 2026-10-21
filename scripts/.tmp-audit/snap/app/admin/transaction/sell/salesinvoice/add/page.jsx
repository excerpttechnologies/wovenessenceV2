'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Sales Invoice */

export default function AddTransactionSellSalesinvoicePage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Sales Invoices",
        addTitle: "Sales Invoice",
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
