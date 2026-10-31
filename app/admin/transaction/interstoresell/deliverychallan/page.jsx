'use client';
import ListView from '@/components/ListView';
import StoreReceivePanel from '@/components/StoreReceivePanel';

/* Inter Store Sell > Delivery Challan - list.

   Same ListView the rest of the ERP uses, so search, filters, summary boxes,
   pagination, column sorting and the View drawer behave exactly as they do on
   every other transaction screen.

   Status is the receipt state: Dispatched means the goods have left the
   source store and the destination has not accepted them yet; Received means
   they have. Invoiced means a Sales Invoice has billed them. */

const CONFIG = {
  title: 'Inter Store Delivery Challans',
  addTitle: 'Inter Store Delivery Challan',
  basePath: '/admin/transaction/interstoresell/',
  slugPath: 'deliverychallan',
  endpoint: '/api/is-delivery-challan',
  scope: ['business', 'location', 'finYear'],
  pager: 'numbered',
  sortable: true,
  nowrapHead: true,
  actionIcons: ['view', 'edit', 'print', 'delete'],
  printHref: (r) => '/admin/transaction/interstoresell/deliverychallan/print/' + r._id,
  summaryCards: [
    { k: 'count', label: 'Total DC No' },
    { k: 'totalQty', label: 'Total Qty', f: 'amount' },
    { k: 'netValue', label: 'Total Value', f: 'amount' },
  ],
  filters: [
    { k: 'toLocationId', label: 'Destination Store', type: 'ref', ref: 'companylocations', placeholder: 'Select Store' },
    /* real receipt states - components/ListView.jsx's Filter supports a
       select with {v,l} options, and the endpoint already honours ?status= */
    {
      k: 'status',
      label: 'Status',
      type: 'select',
      all: 'All Statuses',
      opts: [
        { v: 'dispatched', l: 'Dispatched' },
        { v: 'received', l: 'Received' },
        { v: 'invoiced', l: 'Invoiced' },
      ],
    },
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  /* the destination store accepts its deliveries here, above the list - the
     slot components/ListView.jsx documents as `beforeTable` */
  beforeTable: <StoreReceivePanel />,
  columns: [
    { k: 'dcNo', t: 'DC No' },
    { k: 'dcDate', t: 'DC Date', f: 'date' },
    { k: 'locationId', t: 'From Store', f: 'ref' },
    { k: 'toLocationId', t: 'To Store', f: 'ref' },
    { k: 'stockPointId', t: 'Stock Point', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
    { k: 'taxableValue', t: 'Taxable Value', f: 'amount' },
    { k: 'netValue', t: 'Total Value', f: 'amount' },
    {
      k: 'receivedAt',
      t: 'Status',
      f: 'badges',
      value: (r) => (r.receivedAt ? 'Received' : 'Dispatched'),
      tone: (v) => (v === 'Received' ? 'green' : 'yellow'),
    },
  ],
};

export default function StoreDeliveryChallanListPage() {
  return <ListView cfg={CONFIG} />;
}
