'use client';
import ListView from '@/components/ListView';

/* Inter Store Sell > Sales Invoice - list.

   One row per invoice, with the challans it billed. The Add screen picks a
   received Delivery Challan and copies its saved lines into the invoice; the
   API refuses to bill a quantity twice. */

const CONFIG = {
  title: 'Inter Store Sales Invoices',
  addTitle: 'Inter Store Sales Invoice',
  basePath: '/admin/transaction/interstoresell/',
  slugPath: 'salesinvoice',
  endpoint: '/api/is-sales-invoice',
  scope: ['business', 'location', 'finYear'],
  pager: 'numbered',
  sortable: true,
  nowrapHead: true,
  actionIcons: ['view', 'print'],
  printHref: (r) => '/admin/transaction/interstoresell/salesinvoice/print/' + r._id,
  summaryCards: [
    { k: 'count', label: 'Total Invoices' },
    { k: 'totalQty', label: 'Total Qty', f: 'amount' },
    { k: 'netValue', label: 'Total Value', f: 'amount' },
  ],
  filters: [
    { k: 'toLocationId', label: 'Buying Store', type: 'ref', ref: 'companylocations', placeholder: 'Select Store' },
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'invoiceNo', t: 'Invoice No' },
    { k: 'invoiceDate', t: 'Invoice Date', f: 'date' },
    { k: 'locationId', t: 'From Store', f: 'ref' },
    { k: 'toLocationId', t: 'To Store', f: 'ref' },
    {
      k: 'deliveryChallanNos',
      t: 'DC No(s)',
      value: (r) => (r.deliveryChallanNos || []).join(', ') || '-',
    },
    { k: 'taxableValue', t: 'Taxable Value', f: 'amount' },
    { k: 'igstTotal', t: 'IGST', f: 'amount' },
    { k: 'cgstTotal', t: 'CGST', f: 'amount' },
    { k: 'sgstTotal', t: 'SGST', f: 'amount' },
    { k: 'netValue', t: 'Net Value', f: 'amount' },
  ],
};

export default function StoreSalesInvoiceListPage() {
  return <ListView cfg={CONFIG} />;
}
