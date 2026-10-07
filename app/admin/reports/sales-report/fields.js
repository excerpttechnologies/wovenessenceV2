/* Sales Report - spec.

   Sales performance by supplier (or by item), with cost and profit.

   Cost has no home on a sales line in this project, so the route resolves it
   from what the goods were received at - BarcodeLabel.finalNet, falling back
   to purRate - and takes the supplier from the same rows. That is the only
   link a sold item has back to the vendor it came from.

   THIS REPORT WILL RETURN NO ROWS until the Sell screens capture line
   quantities and rates and the POS till starts posting. See the note at the
   top of app/api/reports/sales-report/route.js. */

export const REPORT_TYPE_OPTS = [
  { v: 'summary', l: 'Sales Summary' },
  { v: 'item', l: 'Item wise' },
];

export const REPORT = {
  slug: 'sales-report',
  title: 'Sales Report',
  subtitle: 'Sales performance by location, supplier and item, with cost and profit.',
  hint: 'One row per location and supplier.',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'reportType', label: 'Report Type', type: 'select', opts: REPORT_TYPE_OPTS, all: 'Sales Summary', req: true, def: 'summary' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', all: 'All Suppliers' },
  ],

  /* the five figures above the table */
  tiles: [
    { k: 'totalSaleQty', label: 'Total Sale Qty', icon: 'box', cls: 'stat-ico-teal' },
    { k: 'totalSaleAmount', label: 'Total Sale Amount', icon: 'register', cls: 'stat-ico-green' },
    { k: 'totalSaleTax', label: 'Total Sale Tax', icon: 'ledger', cls: 'stat-ico-amber' },
    { k: 'totalCost', label: 'Total Cost', icon: 'bag', cls: 'stat-ico-rose' },
    { k: 'totalProfit', label: 'Total Profit', icon: 'chart', cls: 'stat-ico-blue' },
  ],

  sections: [{
    key: 'summary',
    title: 'Sales Summary',
    totalsRow: true,
    columns: [
      { k: 'supplierName', t: 'Supplier Name' },
      { k: 'saleQty', t: 'Sale Qty', f: 'amount', total: true },
      { k: 'saleAmount', t: 'Sale Amount', f: 'amount', total: true },
      { k: 'saleTax', t: 'Sale Tax', f: 'amount', total: true },
      { k: 'totalCost', t: 'Total Cost', f: 'amount', total: true },
      { k: 'totalProfit', t: 'Total Profit', f: 'amount', total: true },
      { k: 'profitPct', t: 'Profit %', f: 'amount' },
      { k: 'supplierGstNo', t: 'Supplier GST No' },
      { k: 'supplierMobile', t: 'Supplier Mobile' },
    ],
  }],
};
