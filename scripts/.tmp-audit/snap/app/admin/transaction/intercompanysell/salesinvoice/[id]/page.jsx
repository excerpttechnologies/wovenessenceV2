'use client';
import { use } from 'react';
import IcSalesInvoiceForm from '@/components/IcSalesInvoiceForm';

/* View an Inter Company Sales Invoice.

   Deliberately read-only. Every line came from a delivery challan that this
   invoice has already claimed, so editing the invoice would put the two
   documents out of step. To change what it carries, delete the invoice -
   which releases its challans - and raise it again. Same rule as Dispatch. */

export default function ViewIcSalesInvoicePage({ params }) {
  const { id } = use(params);
  return (
    <IcSalesInvoiceForm
      id={id}
      cfg={{
        title: 'Inter Company Sales Invoices',
        addTitle: 'Inter Company Sales Invoice',
        basePath: '/admin/transaction/intercompanysell/',
        slugPath: 'salesinvoice',
        endpoint: '/api/ic-sales-invoice',
        scope: ['business', 'location', 'finYear'],
        docType: 'Inter Company Sales Invoice',
      }}
    />
  );
}
