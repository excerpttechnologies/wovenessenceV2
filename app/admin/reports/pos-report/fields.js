/* POS Report - spec.

   Finalized POS sales, two views over one set of filters.

   The tax columns are split two ways, matching the deployed report: IGST /
   CGST / SGST is the whole tax on the bill, and the "(5%)" / "(2.5%)" columns
   are the part of that tax which came from lines carrying exactly that rate.
   On a single-slab shop the two read the same; on a mixed-slab one they do not.

   THIS REPORT STAYS EMPTY until the POS till starts posting - nothing in the
   codebase writes a PosInvoice. See the note at the top of
   app/api/reports/pos-report/route.js. */

export const REPORT = {
  slug: 'pos-report',
  title: 'POS Report',
  subtitle: 'Finalized POS sales, bill by bill or item by item.',
  filterTitle: 'POS Report Filters',
  hint: 'Finalized POS bills for the selected window. The tabs share these filters.',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'salesPersonId', label: 'Sales Person', type: 'ref', ref: 'agent', all: 'Select...' },
  ],

  /* both tabs show the same five figures */
  tiles: [
    { k: 'totalBills', label: 'Total Bills', icon: 'file', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'gross', label: 'Gross', icon: 'ledger', cls: 'bg-[#f4a7bb]' },
    { k: 'discount', label: 'Discount', icon: 'voucher', cls: 'bg-[#e3c765]' },
    { k: 'net', label: 'Net', icon: 'register', cls: 'bg-[#90ddc4]' },
    { k: 'taxable', label: 'Taxable', icon: 'chart', cls: 'bg-[#f3a898]' },
  ],

  tabs: [
    {
      k: 'billwise',
      label: 'Bill-wise',
      sections: [{
        key: 'billwise',
        title: 'Bill-wise',
        totalsRow: true,
        columns: [
          { k: 'location', t: 'Location Name' },
          { k: 'invoiceNo', t: 'Inv No.' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'salesPerson', t: 'Sales Person' },
          { k: 'customerName', t: 'Customer Name' },
          { k: 'mobile', t: 'Mobile' },
          { k: 'gstNo', t: 'GST No.' },
          { k: 'gross', t: 'Gross', f: 'amount', total: true },
          { k: 'discount', t: 'Discount', f: 'amount', total: true },
          { k: 'net', t: 'Net', f: 'amount', total: true },
          { k: 'taxable', t: 'Taxable', f: 'amount', total: true },
          { k: 'igst', t: 'IGST', f: 'amount', total: true },
          { k: 'cgst', t: 'CGST', f: 'amount', total: true },
          { k: 'sgst', t: 'SGST', f: 'amount', total: true },
          { k: 'igst5', t: 'IGST (5%)', f: 'amount', total: true },
          { k: 'cgst25', t: 'CGST (2.5%)', f: 'amount', total: true },
          { k: 'sgst25', t: 'SGST (2.5%)', f: 'amount', total: true },
        ],
      }],
    },
    {
      k: 'itemwise',
      label: 'Item-wise',
      sections: [{
        key: 'itemwise',
        title: 'Item-wise',
        totalsRow: true,
        columns: [
          { k: 'location', t: 'Location Name' },
          { k: 'invoiceNo', t: 'Inv No.' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'itemCode', t: 'Item Code' },
          { k: 'itemName', t: 'Item Name' },
          { k: 'hsn', t: 'HSN' },
          { k: 'qty', t: 'Qty', f: 'amount', total: true },
          { k: 'rate', t: 'Rate', f: 'amount' },
          { k: 'discount', t: 'Discount', f: 'amount', total: true },
          { k: 'net', t: 'Net', f: 'amount', total: true },
          { k: 'taxable', t: 'Taxable', f: 'amount', total: true },
        ],
      }],
    },
  ],
};
