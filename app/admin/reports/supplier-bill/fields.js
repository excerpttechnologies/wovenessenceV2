/* Supplier Bill Report - spec.

   One row per goods receipt: what the supplier billed, how much came in, how
   much went back, and what is left.

   THE QUANTITIES COME FROM THE BILL'S OWN UNITS. A barcode row is one unit of
   stock and carries the GRC that brought it in, so purchase / return / close
   are the units in, the units returned to the vendor and the units still
   IN_STOCK - each counted once, for the bill that supplied it. The route
   used to attribute SALES BY ITEM CODE, which took the same sales off every
   bill that happened to receive that code.

   Return Qty falls back to GRT by GRC NUMBER, because Grt stores grcNumber
   as a string and carries no reference to the GRC document.

   "Sold / Out Qty" is everything no longer on the shelf from this bill -
   sold, or out on a transfer. It is derived (purchase - return - close), so
   it does not depend on the Sell screens capturing line quantities. */

export const REPORT = {
  slug: 'supplier-bill',
  title: 'Supplier Bill Report',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', multi: true, all: 'Select Supplier' },
    { k: 'billNo', label: 'Bill No', type: 'text', placeholder: 'GRC number' },
    { k: 'purchaseGroupId', label: 'Purchase Group', type: 'ref', ref: 'purchasegroup', all: 'Select...' },
    { k: 'agentId', label: 'Agent', type: 'ref', ref: 'agent', multi: true, all: 'Type to search' },
    { k: 'city', label: 'City', type: 'text', placeholder: 'Select City' },
    { k: 'cityGroupId', label: 'City Group', type: 'ref', ref: 'citygroup', all: 'All City Groups' },
  ],

  sections: [{
    key: 'bills',
    totalsRow: true,
    columns: [
      { k: 'location', t: 'Location' },
      { k: 'supplier', t: 'Supplier' },
      { k: 'grcNo', t: 'GRC No' },
      { k: 'date', t: 'Date', f: 'date' },
      { k: 'billValue', t: 'Bill Value', f: 'amount', total: true },
      { k: 'purchaseQty', t: 'Purchase Qty', f: 'amount', total: true },
      { k: 'returnQty', t: 'Return Qty', f: 'amount', total: true },
      { k: 'saleQty', t: 'Sold / Out Qty', f: 'amount', total: true },
      { k: 'closeQty', t: 'Close Qty', f: 'amount', total: true },
      { k: 'closeBal', t: 'Close Bal', f: 'amount', total: true },
    ],
  }],
};
