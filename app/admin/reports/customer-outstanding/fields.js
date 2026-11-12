/* Customer Outstanding Report - spec.

   What each customer still owes on their till bills.

     Total Due = outstanding POS Invoices - outstanding POS Returns

   "Outstanding" on an invoice is the UNPAID part of the bill
   (PosInvoice.sellDue), not the whole bill - a fully paid cash sale
   contributes nothing. That is why a busy shop can still show a short list.

   Customers with bills in the selected period remain visible when fully paid.

   Tabs sit above the filter card, matching the deployed screen.

   The summary shows customer activity whether due or fully settled; the
   Detailed tab lists the bills behind those totals. */

export const REPORT = {
  slug: 'customer-outstanding',
  title: 'Customer Outstanding Report',
  subtitle: 'What each customer still owes on their till bills.',
  filterTitle: 'Customer-wise Summary',
  countLabel: 'Total Customers',
  tabsPosition: 'top',
  perPage: 15,
  /* the report's own Location filter says All Locations -> the top-bar
     location is not applied on top of it */
  locationAll: true,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'customerId', label: 'Customer', type: 'ref', ref: 'customer', all: 'All Customers' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
  ],

  tiles: [
    { k: 'totalCustomers', label: 'Total Customers', icon: 'users', cls: 'bg-[#a9dfe8]', f: 'count' },
    { k: 'outstandingInvoice', label: 'Total Outstanding POS Invoice', icon: 'file', cls: 'bg-[#f4a7bb]' },
    { k: 'outstandingReturn', label: 'Total Outstanding POS Return', icon: 'back', cls: 'bg-[#e3c765]' },
    { k: 'grandTotalDue', label: 'Grand Total Due', icon: 'register', cls: 'bg-[#90ddc4]' },
  ],

  tabs: [
    {
      k: 'summary',
      label: 'Customer-wise Summary',
      sections: [{
        key: 'summary',
        totalsRow: true,
        columns: [
          { k: 'customer', t: 'Customer' },
          { k: 'outstandingInvoice', t: 'Outstanding POS Invoice', f: 'amount', total: true },
          { k: 'outstandingReturn', t: 'Outstanding POS Return', f: 'amount', total: true },
          { k: 'totalDue', t: 'Total Due', f: 'amount', total: true },
        ],
      }],
    },
    {
      k: 'detailed',
      label: 'Detailed',
      sections: [{
        key: 'detailed',
        totalsRow: true,
        columns: [
          { k: 'customer', t: 'Customer' },
          { k: 'docType', t: 'Document' },
          { k: 'docNo', t: 'Doc No' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'amount', t: 'Amount', f: 'amount', total: true },
          { k: 'paid', t: 'Paid / Adjusted', f: 'amount', total: true },
          { k: 'balance', t: 'Balance', f: 'amount', total: true },
        ],
      }],
    },
  ],
};
