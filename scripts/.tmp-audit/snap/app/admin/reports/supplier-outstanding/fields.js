/* Supplier Outstanding Report - spec.

   What you still owe each supplier.

     Total Due = outstanding Purchase Invoices - outstanding Debit Notes

   Tabs sit ABOVE the filter card here, matching the deployed screen, because
   each tab is a different question rather than a different view of one answer.

   PAYMENTS ARE NOT NETTED OFF - see the note at the top of
   app/api/reports/supplier-outstanding/route.js for why, and what to change
   if you want the settled position instead. */

export const REPORT = {
  slug: 'supplier-outstanding',
  title: 'Supplier Outstanding Report',
  subtitle: 'What you still owe each supplier, and the documents behind it.',
  filterTitle: 'Summary Filters',
  hint: 'One row per supplier, netting outstanding invoices against debit notes.',
  tabsPosition: 'top',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', all: 'All Suppliers' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
  ],

  tiles: [
    { k: 'totalSuppliers', label: 'Total Suppliers', icon: 'users', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'outstandingPi', label: 'Total Outstanding PI', icon: 'file', cls: 'bg-[#f4a7bb]' },
    { k: 'outstandingDn', label: 'Total Outstanding DN', icon: 'back', cls: 'bg-[#e3c765]' },
    { k: 'grandTotalDue', label: 'Grand Total Due', icon: 'register', cls: 'bg-[#90ddc4]' },
  ],

  tabs: [
    {
      k: 'summary',
      label: 'Supplier-wise Summary',
      sections: [{
        key: 'summary',
        title: 'Supplier-wise Summary',
        totalsRow: true,
        columns: [
          { k: 'supplier', t: 'Supplier' },
          { k: 'outstandingPi', t: 'Outstanding Purchase Invoice', f: 'amount', total: true },
          { k: 'outstandingDn', t: 'Outstanding Debit Note', f: 'amount', total: true },
          { k: 'totalDue', t: 'Total Due', f: 'amount', total: true },
        ],
      }],
    },
    {
      k: 'detailed',
      label: 'Detailed',
      sections: [{
        key: 'detailed',
        title: 'Detailed',
        totalsRow: true,
        columns: [
          { k: 'supplier', t: 'Supplier' },
          { k: 'docType', t: 'Document' },
          { k: 'docNo', t: 'Doc No' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'outstandingPi', t: 'Outstanding Purchase Invoice', f: 'amount', total: true },
          { k: 'outstandingDn', t: 'Outstanding Debit Note', f: 'amount', total: true },
          { k: 'totalDue', t: 'Total Due', f: 'amount', total: true },
        ],
      }],
    },
  ],
};
