'use client';
import ListView from '@/components/ListView';

/* Inter Company Auto Purchases Returns - list.
   Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: 'Auto Purchases Returns',
  basePath: '/admin/transaction/intercompanysell/',
  slugPath: 'auto-purchases-return',
  endpoint: '/api/ic-auto-purchase-return',
  scope: ['business', 'location', 'finYear'],
  addTitle: 'Inter Company Auto Purchases Return',
  actionIcons: ['view', 'edit', 'delete'],
  columns: [
    { k: 'supplierId', t: 'Supplier', f: 'ref' },
    { k: 'debitNoteNo', t: 'Debit Note', f: 'dash' },
    { k: 'returnNo', t: 'Return No' },
    { k: 'toBusinessId', t: 'To Business', f: 'ref' },
    { k: 'toLocationId', t: 'To Location', f: 'ref' },
    { k: 'returnDate', t: 'Date', f: 'date' },
  ],
};

export default function IcAutoPurchaseReturnListPage() {
  return <ListView cfg={CONFIG} />;
}
