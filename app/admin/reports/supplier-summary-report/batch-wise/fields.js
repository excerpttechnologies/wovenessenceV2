/* Supplier Batch-wise Report - spec.

   One row per ITEM CODE on the chosen bill - the last step of
   Supplier Summary -> Bill-wise -> Batch-wise, from which the item code
   opens the Item Stock report.

   SUPPLIER AND BILL ARE BOTH REQUIRED: "batch-wise" without a bill has no
   meaning here, because the batch lives on the unit a bill brought in.

   BATCH NUMBER: this ERP has no batch master and no lot table. A unit
   carries barcodeLabel.batchNo (written when it was generated); a unit
   without one shows blank. That is the whole of what batch tracking this
   system has, and inventing a number would be worse than the gap.

   Purchase Rate is the weighted cost of what this bill received in the
   window - received value / received quantity - not today's price. */

const qty = (k, t) => ({ k, t, f: 'amount', total: true });

export const REPORT = {
  slug: 'supplier-batch-wise',
  title: 'Supplier Batch-wise Report',
  subtitle: 'Item-wise position of one supplier bill.',
  perPage: 15,
  countLabel: 'Total Item Codes',
  filterLayout: 'rows',
  locationAll: true,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', req: true, all: 'Select Supplier' },
    {
      k: 'billNo',
      label: 'Bill No',
      type: 'ref',
      ref: 'grc-number',
      req: true,
      dependsOn: 'supplierId',
      dependsParam: 'supplierId',
      waitPlaceholder: 'Select supplier first',
      all: 'Select Bill',
    },
    { k: 'itemId', label: 'Item', type: 'ref', ref: 'item', multi: true, all: 'Type to search' },
    { k: 'itemSearch', label: 'Item Code', type: 'text', placeholder: 'Code or name' },
  ],

  tiles: [
    { k: 'totalItemCodes', label: 'Total Item Codes', icon: 'grid', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'openingQty', label: 'Total Opening Qty', icon: 'box', cls: 'bg-[#f4a7bb]' },
    { k: 'purchaseQty', label: 'Total Purchase Qty', icon: 'truck', cls: 'bg-[#90ddc4]' },
    { k: 'soldQty', label: 'Total Sold Qty', icon: 'bag', cls: 'bg-[#f3a898]' },
    { k: 'closingQty', label: 'Total Closing Qty', icon: 'warehouse', cls: 'bg-[#e3c765]' },
    { k: 'closingValue', label: 'Total Closing Value', icon: 'calculator', cls: 'bg-[#c3b6e8]' },
  ],

  sections: [{
    key: 'items',
    totalsRow: true,
    columns: [
      { k: 'supplier', t: 'Supplier Name' },
      { k: 'billNo', t: 'Bill No' },
      { k: 'billDate', t: 'Bill Date', f: 'date' },
      { k: 'itemName', t: 'Item Name' },
      {
        k: 'itemCode',
        t: 'Item Code',
        /* -> Item Stock, which is a ReportView screen and therefore seeds
           its own filters from the URL too */
        link: (row, f) => {
          if (!row.itemCode) return '';
          const q = new URLSearchParams({ itemSearch: row.itemCode });
          if (f?.fromDate) q.set('fromDate', f.fromDate);
          if (f?.toDate) q.set('toDate', f.toDate);
          return '/admin/reports/item-stock?' + q.toString();
        },
      },
      { k: 'batchNo', t: 'Batch No' },
      qty('openingQty', 'Opening Qty'),
      qty('purchaseQty', 'Purchase Qty'),
      qty('purchaseReturnQty', 'Purchase Return Qty'),
      qty('soldQty', 'Sold Qty'),
      qty('salesReturnQty', 'Sales Return Qty'),
      qty('closingQty', 'Closing Qty'),
      qty('purchaseRate', 'Purchase Rate'),
      qty('closingValue', 'Closing Value'),
    ],
  }],
};
