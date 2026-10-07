/* Supplier Bill Report - spec.

   One row per goods receipt: what the supplier billed, how much came in, how
   much went back, and what is left.

   Return Qty is matched by GRC NUMBER, because Grt stores grcNumber as a
   string and carries no reference to the GRC document.

   Net Sale Qty reads 0.00 until the Sell screens capture line quantities, so
   Close Qty is currently purchases less returns. */

export const REPORT = {
  slug: 'supplier-bill',
  title: 'Supplier Bill Report',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', all: 'Select Supplier' },
    { k: 'purchaseGroupId', label: 'Purchase Group', type: 'ref', ref: 'purchasegroup', all: 'Select...' },
    { k: 'city', label: 'City', type: 'text', placeholder: 'Select City' },
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
      { k: 'saleQty', t: 'Net Sale Qty', f: 'amount', total: true },
      { k: 'closeQty', t: 'Close Qty', f: 'amount', total: true },
      { k: 'closeBal', t: 'Close Bal', f: 'amount', total: true },
    ],
  }],
};
