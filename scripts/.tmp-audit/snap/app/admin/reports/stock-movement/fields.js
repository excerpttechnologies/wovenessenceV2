/* Stock Movement Report - spec.

   Every stock event in a window, five ways. The source is the movement
   ledger, which is written by the same transaction that moves the stock, so
   these figures cannot disagree with what is on the shelf.

   Deliberately NOT seeded or back-filled: a window with no trading shows
   nothing, and a window that predates the ledger says so on the screen
   rather than looking like a quiet month. */

const FLOW = [
  { k: 'inQty', t: 'In Qty', f: 'amount', total: true },
  { k: 'outQty', t: 'Out Qty', f: 'amount', total: true },
  { k: 'net', t: 'Net', f: 'amount', total: true },
];

export const REPORT = {
  slug: 'stock-movement',
  title: 'Stock Movement Report',
  subtitle: 'Daily stock transactions - received, transferred, received back, returned and sold.',
  filterTitle: 'Stock Movement Filters',
  hint: 'Every stock event in the window. All tabs share these filters.',
  perPage: 20,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    {
      k: 'type',
      label: 'Event Type',
      type: 'select',
      all: 'All Events',
      opts: [
        { v: 'GRC_IN', l: 'Goods Received (GRC)' },
        { v: 'TRANSFER_OUT', l: 'Transferred Out' },
        { v: 'TRANSFER_IN', l: 'Received at Destination' },
        { v: 'TRANSFER_RETURN_OUT', l: 'Returned by Destination' },
        { v: 'TRANSFER_RETURN_IN', l: 'Return Taken Back' },
        { v: 'POS_OUT', l: 'Sold at POS' },
        { v: 'POS_RETURN_IN', l: 'Customer Return' },
        { v: 'ECOM_OUT', l: 'E-commerce Transfer' },
        { v: 'GRC_VOID', l: 'Written Off / Vendor Return' },
      ],
    },
  ],

  tiles: [
    { k: 'events', label: 'Movements', icon: 'shuffle', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'barcodes', label: 'Barcodes Moved', icon: 'barcode', cls: 'bg-[#c9b6e4]', f: 'count' },
    { k: 'received', label: 'Received', icon: 'box', cls: 'bg-[#90ddc4]' },
    { k: 'transferred', label: 'Transferred Out', icon: 'truck', cls: 'bg-[#e3c765]' },
    { k: 'sold', label: 'Sold', icon: 'cart', cls: 'bg-[#a0c4ff]' },
    { k: 'returned', label: 'Returned', icon: 'undo', cls: 'bg-[#f3a898]' },
  ],

  tabs: [
    {
      k: 'daily',
      label: 'Daily Transactions',
      sections: [{
        key: 'daily',
        title: 'Daily Stock Transactions',
        totalsRow: true,
        columns: [
          { k: 'day', t: 'Date' },
          { k: 'events', t: 'Movements', total: true },
          { k: 'barcodes', t: 'Barcodes' },
          { k: 'received', t: 'Received', f: 'amount', total: true },
          { k: 'transferredOut', t: 'Transferred Out', f: 'amount', total: true },
          { k: 'transferredIn', t: 'Received In', f: 'amount', total: true },
          { k: 'sold', t: 'Sold', f: 'amount', total: true },
          { k: 'returned', t: 'Returned', f: 'amount', total: true },
          ...FLOW,
        ],
      }],
    },
    {
      k: 'bytype',
      label: 'By Event Type',
      sections: [{
        key: 'bytype',
        title: 'Movements by Type',
        totalsRow: true,
        columns: [
          { k: 'type', t: 'Event' },
          { k: 'events', t: 'Movements', total: true },
          ...FLOW,
        ],
      }],
    },
    {
      k: 'bylocation',
      label: 'Location Wise',
      sections: [{
        key: 'bylocation',
        title: 'Location Wise Stock Movement',
        totalsRow: true,
        columns: [
          { k: 'location', t: 'Location' },
          { k: 'events', t: 'Movements', total: true },
          ...FLOW,
        ],
      }],
    },
    {
      k: 'bybarcode',
      label: 'Barcode Wise',
      sections: [{
        key: 'bybarcode',
        title: 'Barcode Wise Movement',
        columns: [
          { k: 'barcodeNo', t: 'Barcode' },
          { k: 'itemCode', t: 'Item Code' },
          { k: 'itemName', t: 'Item Name' },
          { k: 'events', t: 'Events' },
          { k: 'trail', t: 'Movement Trail' },
          { k: 'first', t: 'First Seen', f: 'datetime' },
          { k: 'last', t: 'Last Moved', f: 'datetime' },
          { k: 'status', t: 'Position' },
        ],
      }],
    },
    {
      k: 'bydocument',
      label: 'Document Wise',
      sections: [{
        key: 'bydocument',
        title: 'Movements by Document',
        totalsRow: true,
        columns: [
          { k: 'at', t: 'Date / Time', f: 'datetime' },
          { k: 'docType', t: 'Type' },
          { k: 'document', t: 'Document No' },
          { k: 'from', t: 'From' },
          { k: 'to', t: 'To' },
          { k: 'events', t: 'Lines', total: true },
          { k: 'qty', t: 'Qty', f: 'amount', total: true },
          { k: 'user', t: 'User' },
        ],
      }],
    },
  ],
};
