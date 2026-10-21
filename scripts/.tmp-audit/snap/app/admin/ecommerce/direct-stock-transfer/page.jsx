'use client';
import ListView from '@/components/ListView';
import { STATUS_LABEL } from '@/components/transferConstants';

/* E-Commerce -> Direct Stock Transfers.

   The same /api/stock-transfer list, narrowed to documents raised from the
   e-commerce side. They are ordinary transfers - they receive, return and
   bill through exactly the same screens - this list just answers "what has
   e-commerce sent out". */

const CONFIG = {
  title: 'E-Commerce Direct Stock Transfers',
  basePath: '/admin/',
  slugPath: 'ecommerce/direct-stock-transfer',
  endpoint: '/api/stock-transfer',
  scope: ['business', 'location', 'finYear'],
  addHref: '/admin/ecommerce/direct-stock-transfer/add',
  actionPosition: 'left',
  actionVariant: 'dropdown',
  actionMenu: [
    { label: 'Open', icon: 'eye', to: (row) => `/admin/transaction/stocktransfers/transfer/${row._id}` },
    { label: 'Delivery Challan', icon: 'printer', to: (row) => `/admin/transaction/stocktransfers/transfer/${row._id}/challan` },
  ],
  fixedQuery: { source: 'ECOMMERCE' },
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
    { k: 'ecomReference', t: 'Order Ref' },
    { k: 'fromLocationName', t: 'From' },
    { k: 'toLocationName', t: 'To' },
    { k: 'status', t: 'Status' },
    { k: 'sentQty', t: 'Sent Qty' },
    { k: 'receivedQty', t: 'Received' },
    { k: 'returnedQty', t: 'Returned' },
    { k: 'billableQty', t: 'Billable' },
  ],
};

export default function EcomDirectTransferListPage() {
  return <ListView cfg={CONFIG} />;
}
