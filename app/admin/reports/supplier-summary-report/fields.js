/* Supplier Summary Report - spec.

   One row per supplier over a date window, from the stock MOVEMENT ledger
   (lib/stockPosition.js):

     opening = SUM(qty) before Date From
     closing = SUM(qty) before Date To
     the columns between are the movement types inside the window

   so every row satisfies opening + in - out = closing.

   The supplier column LINKS to the Bill-wise report with this supplier, this
   date range and the same location - ReportView passes the applied filters
   to link(row, filters), and the Bill-wise page seeds its own filters from
   the URL, so nothing has to be picked again.

   Filter layout: 'rows' - name on the left, input on the right, every filter
   on screen. These reports exist to be filtered; the Add Filter panel the
   other reports use would hide half of them.

   NOT HERE, on purpose:
     Inter Company Sales - inter company receipts live in their own
     collections (IcPurchaseReceived / IcAutoPurchaseReturn) and whether a
     branch transfer counts as a purchase is an open business rule; a switch
     that guessed would change every quantity on the screen.
     Supplier Group - this database has no supplier group master. */

const qty = (k, t) => ({ k, t, f: 'amount', total: true });

export const REPORT = {
  slug: 'supplier-summary',
  title: 'Supplier Summary Report',
  subtitle: 'Opening, received, returned, sold and closing stock by supplier, from the stock movement ledger.',
  perPage: 15,
  countLabel: 'Total Suppliers',
  filterLayout: 'rows',
  /* the report's own Location filter says All Locations -> do not apply the
     top-bar location on top of it */
  locationAll: true,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', multi: true, all: 'Type to search' },
    { k: 'city', label: 'City', type: 'city', placeholder: 'Type city', suggest: '/api/cities' },
    { k: 'cityGroupId', label: 'City Group', type: 'ref', ref: 'citygroup', all: 'All City Groups' },
    { k: 'agentId', label: 'Agent', type: 'ref', ref: 'agent', multi: true, all: 'Type to search' },
  ],

  tiles: [
    { k: 'totalSuppliers', label: 'Total Suppliers', icon: 'users', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'openingQty', label: 'Total Opening Qty', icon: 'box', cls: 'bg-[#f4a7bb]' },
    { k: 'purchaseQty', label: 'Total Purchase Qty', icon: 'truck', cls: 'bg-[#90ddc4]' },
    { k: 'soldQty', label: 'Total Sold Qty', icon: 'bag', cls: 'bg-[#f3a898]' },
    { k: 'closingQty', label: 'Total Closing Qty', icon: 'warehouse', cls: 'bg-[#e3c765]' },
    { k: 'closingValue', label: 'Total Closing Value', icon: 'calculator', cls: 'bg-[#c3b6e8]' },
  ],

  sections: [{
    key: 'suppliers',
    totalsRow: true,
    columns: [
      {
        k: 'supplier',
        t: 'Supplier Name',
        /* -> Bill-wise, this supplier, these dates. Blank for stock whose
           units carry no supplier (imported without one), which has nothing
           to drill into. */
        link: (row, f) => {
          if (!row.supplierId) return '';
          const q = new URLSearchParams({ supplierId: row.supplierId });
          if (f?.fromDate) q.set('fromDate', f.fromDate);
          if (f?.toDate) q.set('toDate', f.toDate);
          return '/admin/reports/supplier-summary-report/bill-wise?' + q.toString();
        },
      },
      { k: 'supplierCode', t: 'Supplier Code' },
      qty('openingQty', 'Opening Qty'),
      qty('purchaseQty', 'Purchase Qty'),
      qty('purchaseReturnQty', 'Purchase Return Qty'),
      qty('soldQty', 'Sold Qty'),
      qty('salesReturnQty', 'Sales Return Qty'),
      qty('transferInQty', 'Transfer In Qty'),
      qty('transferOutQty', 'Transfer Out Qty'),
      qty('adjustmentQty', 'Adjustment Qty'),
      qty('closingQty', 'Closing Qty'),
      qty('closingValue', 'Closing Value'),
    ],
  }],
};
