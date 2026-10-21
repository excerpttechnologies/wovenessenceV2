'use client';
import ListView from '@/components/ListView';
import { STATUS_LABEL } from '@/components/transferConstants';

/* Incoming Transfers - the destination location's inbox.

   Same endpoint as the Stock Transfers list, narrowed with box=in so it shows
   only what is addressed TO the location selected at the top. A branch user
   opens this, sees what is coming, opens one and receives it.

   The narrowing is a convenience, not the security: the API applies the
   user's own permitted locations regardless of what the query string asks
   for, so this list cannot be widened by editing the URL. */

const CONFIG = {
  title: 'Incoming Transfers',
  basePath: '/admin/',
  slugPath: 'transaction/stocktransfers/incoming',
  endpoint: '/api/stock-transfer',
  scope: ['business', 'location', 'finYear'],
  showAdd: false,
  actionPosition: 'left',
  actionVariant: 'dropdown',
  actionMenu: [
    { label: 'Receive / View', icon: 'eye', to: (row) => `/admin/transaction/stocktransfers/transfer/${row._id}` },
  ],
  /* box=in is fixed for this screen - it is what makes it the inbox */
  fixedQuery: { box: 'in' },
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
    { k: 'status', t: 'Status' },
    { k: 'sentQty', t: 'Sent Qty' },
    { k: 'sentCount', t: 'Items' },
    { k: 'receivedQty', t: 'Received' },
    { k: 'returnedQty', t: 'Returned' },
    { k: 'pendingQty', t: 'Pending' },
    { k: 'waybill', t: 'Waybill' },
  ],
};

export default function IncomingTransfersPage() {
  return <ListView cfg={CONFIG} />;
}
