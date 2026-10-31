'use client';
import ListView from '@/components/ListView';

/* Inter Store Sell > Sales Return - list.

   The one document after the challan that moves stock: the returned quantity
   leaves the buying store and goes back into the selling store, with a
   movement row for each side. */

const CONFIG = {
  title: 'Inter Store Sales Returns',
  addTitle: 'Inter Store Sales Return',
  basePath: '/admin/transaction/interstoresell/',
  slugPath: 'salesreturn',
  endpoint: '/api/is-sales-return',
  scope: ['business', 'location', 'finYear'],
  pager: 'numbered',
  sortable: true,
  nowrapHead: true,
  actionIcons: ['view', 'print'],
  printHref: (r) => '/admin/transaction/interstoresell/salesreturn/print/' + r._id,
  summaryCards: [
    { k: 'count', label: 'Total Returns' },
    { k: 'totalQty', label: 'Total Qty', f: 'amount' },
    { k: 'netValue', label: 'Total Value', f: 'amount' },
  ],
  filters: [
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'returnNo', t: 'Return No' },
    { k: 'returnDate', t: 'Date', f: 'date' },
    { k: 'salesInvoiceNo', t: 'Sales Invoice' },
    { k: 'locationId', t: 'Store', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
    { k: 'taxableValue', t: 'Taxable Value', f: 'amount' },
    { k: 'igstTotal', t: 'IGST', f: 'amount' },
    { k: 'cgstTotal', t: 'CGST', f: 'amount' },
    { k: 'sgstTotal', t: 'SGST', f: 'amount' },
    { k: 'netValue', t: 'Return Total', f: 'amount' },
  ],
};

export default function StoreSalesReturnListPage() {
  return <ListView cfg={CONFIG} />;
}
