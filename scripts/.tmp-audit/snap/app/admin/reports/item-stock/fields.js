/* Item Stock Report - spec.

   Opening, inward, outward and closing stock, four ways.

   HOW THE NUMBERS ARE DERIVED. Every stock event is recorded in the movement
   ledger (models/StockMovement.js) as it happens, so:

     opening  net of every movement before the window
     inward   positive movements inside it
     outward  negative movements inside it
     close    opening + inward - outward

   The received / transferred / sold / returned columns are the same
   movements split by what caused them, so a figure can be traced to the
   documents behind it rather than only totalled.

   (This report previously had to infer all of that - there was no ledger, and
   its own note recorded that outward always read 0.00 and closing stock
   therefore equalled everything ever received.) */

/* the five movement columns every tab shows */
const MOVEMENT = [
  { k: 'open', t: 'Open Qty', f: 'amount', total: true },
  { k: 'inward', t: 'Inward Qty', f: 'amount', total: true },
  { k: 'outward', t: 'Outward Qty', f: 'amount', total: true },
  { k: 'closeQty', t: 'Close Qty', f: 'amount', total: true },
  { k: 'closeValue', t: 'Close Value', f: 'amount', total: true },
];

/* where the movement came from - shown on the item-level tabs, where a
   single figure is not enough to act on */
const BREAKDOWN = [
  { k: 'received', t: 'Received', f: 'amount', total: true },
  { k: 'transferredIn', t: 'Transfer In', f: 'amount', total: true },
  { k: 'transferredOut', t: 'Transfer Out', f: 'amount', total: true },
  { k: 'sold', t: 'Sold', f: 'amount', total: true },
  { k: 'returned', t: 'Returned', f: 'amount', total: true },
];

export const REPORT = {
  slug: 'item-stock',
  title: 'Item Stock Report',
  subtitle: 'Opening, inward, outward and closing stock, by group or by item code.',
  filterTitle: 'Item Stock Report Filters',
  hint: 'Opening, inward, outward and closing stock for the selected window. The tabs share these filters.',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
  ],

  tiles: [
    { k: 'totalGroups', label: 'Total Groups', icon: 'grid', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'openQty', label: 'Total Open Qty', icon: 'box', cls: 'bg-[#f4a7bb]' },
    { k: 'inwardQty', label: 'Total Inward Qty', icon: 'plus', cls: 'bg-[#90ddc4]' },
    { k: 'outwardQty', label: 'Total Outward Qty', icon: 'shuffle', cls: 'bg-[#f3a898]' },
    { k: 'closeQty', label: 'Total Close Qty', icon: 'bag', cls: 'bg-[#e3c765]' },
    { k: 'closeValue', label: 'Total Close Value', icon: 'register', cls: 'bg-[#c9b6e4]' },
    { k: 'receivedQty', label: 'Received (GRC)', icon: 'box', cls: 'bg-[#b7e4c7]' },
    { k: 'transferredOutQty', label: 'Transferred Out', icon: 'shuffle', cls: 'bg-[#ffd6a5]' },
    { k: 'soldQty', label: 'Sold', icon: 'cart', cls: 'bg-[#a0c4ff]' },
    { k: 'returnedQty', label: 'Returned', icon: 'undo', cls: 'bg-[#ffadad]' },
  ],

  tabs: [
    {
      k: 'groupwise',
      label: 'Group Wise Summary',
      sections: [{
        key: 'groupwise',
        title: 'Group Wise Summary',
        totalsRow: true,
        columns: [
          { k: 'location', t: 'Location Name' },
          { k: 'group', t: 'Group Name' },
          ...MOVEMENT,
        ],
      }],
    },
    {
      k: 'detailed',
      label: 'Group Wise Detailed',
      sections: [{
        key: 'detailed',
        title: 'Group Wise Detailed',
        totalsRow: true,
        columns: [
          { k: 'location', t: 'Location Name' },
          { k: 'group', t: 'Group Name' },
          { k: 'code', t: 'Item Code' },
          { k: 'itemName', t: 'Item Name' },
          ...MOVEMENT,
          ...BREAKDOWN,
        ],
      }],
    },
    {
      k: 'itemwise',
      label: 'Item Wise Summary',
      sections: [{
        key: 'itemwise',
        title: 'Item Wise Summary',
        totalsRow: true,
        columns: [
          { k: 'code', t: 'Item Code' },
          { k: 'itemName', t: 'Item Name' },
          { k: 'group', t: 'Group Name' },
          ...MOVEMENT,
          ...BREAKDOWN,
        ],
      }],
    },
    {
      /* Barcode-level history: every event in the window, newest first.
         This is the "barcode-wise movement" and "transaction history" view -
         it answers where one specific piece went, which a rolled-up quantity
         never can. */
      k: 'movementwise',
      label: 'Barcode Movements',
      sections: [{
        key: 'movementwise',
        title: 'Barcode Movements',
        columns: [
          { k: 'at', t: 'Date / Time', f: 'datetime' },
          { k: 'type', t: 'Event' },
          { k: 'barcodeNo', t: 'Barcode' },
          { k: 'code', t: 'Item Code' },
          { k: 'itemName', t: 'Item Name' },
          { k: 'qty', t: 'Qty', f: 'amount', total: true },
          { k: 'from', t: 'From' },
          { k: 'to', t: 'To' },
          { k: 'refNo', t: 'Document' },
          { k: 'reason', t: 'Reason' },
          { k: 'user', t: 'User' },
        ],
      }],
    },
  ],
};
