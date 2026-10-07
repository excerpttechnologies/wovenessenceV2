'use client';
import IcSalesInvoiceForm from '@/components/IcSalesInvoiceForm';

/* Add Inter Company Sales Invoice.
   Invoice No is issued by the server on save from the Doc Setup master. */

export default function AddIcSalesInvoicePage() {
  return (
    <IcSalesInvoiceForm
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
