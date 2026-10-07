/* POS Summary Report - spec.

   Takings per cashier for a window.

   "Cashier" is really the POS COUNTER: PosInvoice stores counterId and no
   user field, so there is nothing else to group by. The route explains the
   substitution and is a two-line change if a cashier field is ever added to
   the bill.

   The report stays empty until the POS till starts posting - PosTill issues
   only GET requests today, so no PosInvoice is ever written. The deployed
   screen shows "Total Cashiers: 0" for the same reason. */

export const REPORT = {
  slug: 'pos-summary',
  title: 'POS Summary Report',
  countLabel: 'Total Cashiers:',
  paginated: false,

  filters: [
    {
      k: 'location', label: 'Business Location', type: 'ref',
      ref: 'companylocations', all: 'All Locations', req: true,
    },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    {
      k: 'counterId', label: 'Casher', type: 'ref', ref: 'poscounter',
      multi: true, all: 'Select...',
    },
  ],

  sections: [{
    key: 'cashiers',
    totalsRow: true,
    columns: [
      { k: 'cashierName', t: 'Cashier Name' },
      { k: 'subTotal', t: 'Sub Total (Net Sales)', f: 'amount', total: true },
      { k: 'taxable', t: 'Taxable Amount', f: 'amount', total: true },
      { k: 'net', t: 'Net Amount (Grand Total)', f: 'amount', total: true },
    ],
  }],
};
