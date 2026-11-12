/* Supplier Bill-wise Report - spec.

   One row per GOODS RECEIPT (a Grc) of the chosen supplier, with the same
   quantity buckets as the Summary, at bill grain.

   "Bill No" is Grc.grcNumber - the internal GRC number. The SUPPLIER's own
   bill number is Grc.vendorDocNo, a different string that is not shown here;
   see SUPPLIER_STOCK_REPORTS_REQUIREMENTS.md §12, decision 1.

   Bill No LINKS to Batch-wise with the supplier, the bill and the dates, so
   the drill-down does not ask for anything again.

   SUPPLIER IS REQUIRED (req: true). Every bill of every supplier would be
   the purchase book, which the purchase register already is. */

const qty = (k, t) => ({ k, t, f: 'amount', total: true });

export const REPORT = {
  slug: 'supplier-bill-wise',
  title: 'Supplier Bill-wise Report',
  subtitle: 'Every bill of the chosen supplier, with its stock position.',
  perPage: 15,
  countLabel: 'Total Bills',
  filterLayout: 'grid',
  locationAll: true,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', req: true, all: 'Select Supplier' },
    /* only this supplier's bill numbers - /api/options ref 'grc-number' */
    {
      k: 'billNo',
      label: 'Bill No',
      type: 'ref',
      ref: 'grc-number',
      dependsOn: 'supplierId',
      dependsParam: 'supplierId',
      waitPlaceholder: 'Select supplier first',
      all: 'All Bills',
    },
    { k: 'city', label: 'City', type: 'city', placeholder: 'Type city', suggest: '/api/cities' },
    { k: 'cityGroupId', label: 'City Group', type: 'ref', ref: 'citygroup', all: 'All City Groups' },
    { k: 'agentId', label: 'Agent', type: 'ref', ref: 'agent', multi: true, all: 'Type to search' },
  ],

  tiles: [
    { k: 'totalBills', label: 'Total Bills', icon: 'file', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'openingQty', label: 'Total Opening Qty', icon: 'box', cls: 'bg-[#f4a7bb]' },
    { k: 'purchaseQty', label: 'Total Purchase Qty', icon: 'truck', cls: 'bg-[#90ddc4]' },
    { k: 'soldQty', label: 'Total Sold Qty', icon: 'bag', cls: 'bg-[#f3a898]' },
    { k: 'closingQty', label: 'Total Closing Qty', icon: 'warehouse', cls: 'bg-[#e3c765]' },
    { k: 'closingValue', label: 'Total Closing Value', icon: 'calculator', cls: 'bg-[#c3b6e8]' },
  ],

  sections: [{
    key: 'bills',
    totalsRow: true,
    columns: [
      { k: 'supplier', t: 'Supplier Name' },
      {
        k: 'billNo',
        t: 'Bill No',
        /* -> Batch-wise, this bill of this supplier */
        link: (row, f) => {
          if (!row.billNo || !row.supplierId) return '';
          const q = new URLSearchParams({ supplierId: row.supplierId, billNo: row.billNo });
          if (f?.fromDate) q.set('fromDate', f.fromDate);
          if (f?.toDate) q.set('toDate', f.toDate);
          return '/admin/reports/supplier-summary-report/batch-wise?' + q.toString();
        },
      },
      { k: 'billDate', t: 'Bill Date', f: 'date' },
      { k: 'itemCount', t: 'Item Count', f: 'count' },
      qty('openingQty', 'Opening Qty'),
      qty('purchaseQty', 'Purchase Qty'),
      qty('purchaseReturnQty', 'Purchase Return Qty'),
      qty('soldQty', 'Sold Qty'),
      qty('salesReturnQty', 'Sales Return Qty'),
      qty('closingQty', 'Closing Qty'),
      qty('closingValue', 'Closing Value'),
    ],
  }],
};
