/* Customer Outstanding Report - spec.

   What each customer still owes on their till bills.

     Total Due = outstanding POS Invoices - outstanding POS Returns

   "Outstanding" on an invoice is the UNPAID part of the bill
   (PosInvoice.sellDue), not the whole bill - a fully paid cash sale
   contributes nothing. That is why a busy shop can still show a short list.

   Customers who owe nothing are dropped rather than listed as zero rows.

   Tabs sit above the filter card, matching the deployed screen.

   It reports nothing today because the POS till never posts - nothing in the
   codebase writes a PosInvoice. */

export const REPORT = {
  slug: 'customer-outstanding',
  title: 'Customer Outstanding Report',
  filterTitle: 'Customer-wise Summary',
  countLabel: 'Total Customers',
  tabsPosition: 'top',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'customerId', label: 'Customer', type: 'ref', ref: 'customer', all: 'All Customers' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
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
          { k: 'outstandingInvoice', t: 'Outstanding POS Invoice', f: 'amount', total: true },
          { k: 'outstandingReturn', t: 'Outstanding POS Return', f: 'amount', total: true },
          { k: 'totalDue', t: 'Total Due', f: 'amount', total: true },
        ],
      }],
    },
  ],
};
