'use client';
import { use } from 'react';
import IcTaxInvoiceView from '@/components/IcTaxInvoiceView';

/* Print E-Invoice - /admin/transaction/intercompanysell/salesinvoice/print/<id>
   Reached from the Action menu on the Inter Company Sales Invoice list. */

export default function IcSalesInvoicePrintPage({ params }) {
  const { id } = use(params);
  return <IcTaxInvoiceView id={id} />;
}
