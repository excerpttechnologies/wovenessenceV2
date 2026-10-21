'use client';
import { useMemo, useState } from 'react';
import ListView from '@/components/ListView';
import PosInvoiceView from '@/components/PosInvoiceView';
import { fmt } from '@/lib/format';

/* Archive -> POS Bills (21-10-2026).

   The POS bills deleted from Sell -> POS (Delete button, Super Admin only).
   They live in the `posinvoicearchive` collection, read through
   /api/pos-archive. View only: the View button opens the same bill screen
   the POS list uses, read from the archive. Nothing here edits or restores. */

const CONFIG = {
  title: 'Archived POS Bills',
  basePath: '/admin/',
  slugPath: 'archive/pos',
  endpoint: '/api/pos-archive',
  pager: 'numbered',
  sortable: ['date', 'invoiceNo', 'totalAmount', 'archivedAt'],
  scope: ['business', 'location', 'finYear'],
  showAdd: false,
  actionPosition: 'left',
  actionVariant: 'buttons',
  actionMenu: [{ label: 'View', icon: 'eye' }],
  columns: [
    { k: 'date', t: 'Date', f: 'date' },
    { k: 'invoiceNo', t: 'Invoice No' },
    { k: 'counterName', t: 'Counter' },
    { k: 'customerName', t: 'Customer Name' },
    { k: 'customerContact', t: 'Customer Contact' },
    { k: 'totalAmount', t: 'Amount', f: 'amount' },
    { k: 'totalItems', t: 'Total Items' },
    { k: 'archivedAt', t: 'Deleted On', value: (r) => (r.archivedAt ? fmt('datetime', r.archivedAt) : '') },
    { k: 'archivedByName', t: 'Deleted By' },
  ],
};

export default function ArchivePosBillsPage() {
  const [viewId, setViewId] = useState(null);

  const cfg = useMemo(() => ({
    ...CONFIG,
    actionMenu: [{ label: 'View', icon: 'eye', onClick: (row) => setViewId(row._id) }],
  }), []);

  return (
    <>
      <ListView cfg={cfg} />
      {viewId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => setViewId(null)}
        >
          <div
            className="my-6 w-full max-w-6xl overflow-hidden rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <PosInvoiceView id={viewId} endpoint="/api/pos-archive/" onBack={() => setViewId(null)} backLabel="Close" />
          </div>
        </div>
      )}
    </>
  );
}
