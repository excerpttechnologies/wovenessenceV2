/* Sales Person Report - spec.

   Two tabs over one set of filters. The General tab groups by LOCATION - one
   table per location, named by the server - which is what `dynamicSections`
   asks ReportView for. Bill Wise view returns a single flat table of
   documents.

   The ALL row is not a placeholder: only DeliveryChallan carries a
   salesPersonId, so anything raised through Sales Invoice, POS or a return
   has no salesperson to attribute and lands there. The deployed report shows
   the same row for the same reason.

   NOTE ON THE DEPLOYED SCREEN: its card is headed "Stock Summary Report",
   which is a copy-paste from another report. This one says "Sales Person
   Report", because that is what it is.

   Sell Qty and Total Taxable read 0.00 until the Sell screens capture line
   quantities and rates. */

/* the figures every row carries, shared by both tabs */
const FIGURES = [
  { k: 'sellQty', t: 'Sell Qty', f: 'amount', total: true },
  { k: 'taxable', t: 'Total Taxable', f: 'amount', total: true },
  { k: 'sellValue', t: 'Sell Value', f: 'amount', total: true },
  { k: 'returnQty', t: 'Return Qty', f: 'amount', total: true },
  { k: 'returnValue', t: 'Return Value', f: 'amount', total: true },
  { k: 'netValue', t: 'Net Value', f: 'amount', total: true },
];

export const REPORT = {
  slug: 'sales-person',
  title: 'Sales Person Report',
  /* the server names one section per location */
  dynamicSections: true,
  paginated: false,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    {
      k: 'salesPersonId', label: 'Sales Persons', type: 'ref', ref: 'agent',
      multi: true, all: 'Select Sales Person',
    },
  ],

  tabs: [
    {
      k: 'general',
      label: 'General',
      sections: [{
        key: 'general',
        columns: [{ k: 'salesPerson', t: 'Sales Person' }, ...FIGURES],
      }],
    },
    {
      k: 'billwise',
      label: 'Bill Wise view',
      sections: [{
        key: 'billwise',
        columns: [
          { k: 'location', t: 'Location' },
          { k: 'docNo', t: 'Doc No' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'salesPerson', t: 'Sales Person' },
          ...FIGURES,
        ],
      }],
    },
  ],

  /* the standalone totals table under the groups */
  grandTotal: [
    { k: 'taxable', t: 'Taxable', f: 'amount' },
    { k: 'sellQty', t: 'Sell Qty', f: 'amount' },
    { k: 'sellValue', t: 'Sell Value', f: 'amount' },
    { k: 'returnQty', t: 'Return Qty', f: 'amount' },
    { k: 'returnValue', t: 'Return Value', f: 'amount' },
    { k: 'netValue', t: 'Net Value', f: 'amount' },
  ],
};
