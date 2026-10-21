'use client';
import { useRouter } from 'next/navigation';
import ListView from '@/components/ListView';
import { useScanner } from '@/components/useScanner';
import { STATUS_LABEL } from '@/components/transferConstants';

/* Stock Transfers - list.

   Scanning a transfer's document-number barcode anywhere on this page opens
   that transfer. That is the requirement's "scanning the document number
   barcode must open the corresponding transaction", and it resolves through
   the list's own search - the number is looked up, not guessed at. */

const CONFIG = {
  title: 'Stock Transfers',
  basePath: '/admin/',
  slugPath: 'transaction/stocktransfers/transfer',
  endpoint: '/api/stock-transfer',
  scope: ['business', 'location', 'finYear'],
  addHref: '/admin/transaction/stocktransfers/transfer/add',
  actionPosition: 'left',
  actionVariant: 'dropdown',
  actionMenu: [
    { label: 'Open', icon: 'eye', to: (row) => `/admin/transaction/stocktransfers/transfer/${row._id}` },
    { label: 'Delivery Challan', icon: 'printer', to: (row) => `/admin/transaction/stocktransfers/transfer/${row._id}/challan` },
  ],
  filters: [
    { k: 'search', label: 'Transfer / Barcode No', type: 'text' },
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
    {
      k: 'status',
      label: 'Status',
      type: 'select',
      opts: Object.entries(STATUS_LABEL).map(([v, l]) => ({ v, l })),
    },
  ],
  columns: [
    { k: 'transferNo', t: 'Transfer No' },
    { k: 'transferDate', t: 'Date', f: 'date' },
    { k: 'fromLocationName', t: 'From' },
    { k: 'toLocationName', t: 'To' },
    { k: 'status', t: 'Status' },
    { k: 'sentQty', t: 'Sent Qty' },
    { k: 'receivedQty', t: 'Received' },
    { k: 'returnedQty', t: 'Returned' },
    { k: 'billableQty', t: 'Billable' },
    { k: 'billingNo', t: 'Billing No' },
    { k: 'netValue', t: 'Value', f: 'amount' },
  ],
};

export default function StockTransferListPage() {
  const router = useRouter();

  /* A scanned document number goes straight to its transaction. The lookup
     is a normal list query, so a number that does not exist simply reports
     nothing found rather than navigating somewhere wrong. */
  useScanner(async (code) => {
    const r = await fetch('/api/stock-transfer?perPage=1&search=' + encodeURIComponent(code));
    const d = await r.json().catch(() => ({}));
    const hit = (d.rows || [])[0];
    if (hit) router.push('/admin/transaction/stocktransfers/transfer/' + hit._id);
  });

  return <ListView cfg={CONFIG} />;
}
