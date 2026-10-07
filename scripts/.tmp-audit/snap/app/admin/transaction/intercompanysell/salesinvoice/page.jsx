'use client';
import ListView from '@/components/ListView';

/* Inter Company Sales Invoices - list.
   Columns declared here, not fetched from a registry.

   The deployed row shows three separate icon buttons. This project renders a
   single Action menu for lists that need more than view/edit/delete, the way
   the GRC list does - each entry routes properly instead of relying on the
   icon variant's fixed behaviour. */

const CONFIG = {
  title: 'Inter Company Sales Invoices',
  basePath: '/admin/transaction/intercompanysell/',
  slugPath: 'salesinvoice',
  endpoint: '/api/ic-sales-invoice',
  scope: ['business', 'location', 'finYear'],
  addTitle: 'Inter Company Sales Invoice',
  actionPosition: 'right',
  actionVariant: 'dropdown',
  actionMenu: [
    {
      label: 'View',
      icon: 'eye',
      to: (r) => '/admin/transaction/intercompanysell/salesinvoice/' + r._id,
    },
    {
      label: 'Print E-Invoice',
      icon: 'printer',
      to: (r) => '/admin/transaction/intercompanysell/salesinvoice/print/' + r._id,
    },
  ],
  filters: [
    { k: 'toBusinessId', label: 'To Business', type: 'ref', ref: 'business', placeholder: 'Select Business' },
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'invoiceDate', t: 'Invoice Date', f: 'date' },
    { k: 'invoiceNo', t: 'Invoice No' },
    { k: 'toBusinessId', t: 'Customer Name', f: 'ref' },
    { k: 'toBusinessId', t: 'To Business', f: 'ref' },
    { k: 'toLocationId', t: 'To Location', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
    { k: 'netValue', t: 'Net Value', f: 'amount' },
    {
      k: 'receivedId', t: 'Received', f: 'dash',
      value: (r) => (r.receivedId ? 'Received' : ''),
    },
  ],
};

export default function IcSalesInvoiceListPage() {
  return <ListView cfg={CONFIG} />;
}
