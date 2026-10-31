'use client';
import ListView from '@/components/ListView';

/* Inter Store Sell > Received Debit Note - list.

   A financial adjustment against a Sales Invoice. It deliberately has no
   stock effect: the goods never moved, only the value. Anything physically
   coming back is a Sales Return. */

const CONFIG = {
  title: 'Inter Store Received Debit Notes',
  addTitle: 'Received Debit Note',
  basePath: '/admin/transaction/interstoresell/',
  slugPath: 'receiveddebitnote',
  endpoint: '/api/is-debit-note',
  scope: ['business', 'location', 'finYear'],
  pager: 'numbered',
  sortable: true,
  nowrapHead: true,
  actionIcons: ['view', 'print', 'delete'],
  printHref: (r) => '/admin/transaction/interstoresell/receiveddebitnote/print/' + r._id,
  summaryCards: [
    { k: 'count', label: 'Total Notes' },
    { k: 'totalQty', label: 'Total Qty', f: 'amount' },
    { k: 'netValue', label: 'Total Value', f: 'amount' },
  ],
  filters: [
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'debitNoteNo', t: 'Debit Note No' },
    { k: 'debitNoteDate', t: 'Date', f: 'date' },
    { k: 'salesInvoiceNo', t: 'Sales Invoice' },
    { k: 'locationId', t: 'Store', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
    { k: 'taxableValue', t: 'Taxable Value', f: 'amount' },
    { k: 'igstTotal', t: 'IGST', f: 'amount' },
    { k: 'cgstTotal', t: 'CGST', f: 'amount' },
    { k: 'sgstTotal', t: 'SGST', f: 'amount' },
    { k: 'netValue', t: 'Note Total', f: 'amount' },
  ],
};

export default function StoreDebitNoteListPage() {
  return <ListView cfg={CONFIG} />;
}
