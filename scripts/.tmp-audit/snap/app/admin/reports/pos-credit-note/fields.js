/* POS Credit Note Report - spec.

   Credit notes raised against POS bills. The lightest report in the module:
   PosReturn already stores everything the four columns need, so nothing is
   derived.

   Dates are optional here, matching the deployed screen - it opens on the
   whole financial year rather than a month.

   ONE DELIBERATE DIFFERENCE: the deployed screen filters on "Business", which
   duplicates the Business selector already in the top bar and fights it. This
   one filters on Business Location, like every other report in the module -
   the top bar handles the business.

   It stays empty until the POS till starts posting, since nothing writes a
   PosReturn. The deployed screen shows "No Data.." for the same reason. */

export const REPORT = {
  slug: 'pos-credit-note',
  title: 'POS Credit Note Report',
  filterTitle: 'Filters',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'From', type: 'date' },
    { k: 'toDate', label: 'To', type: 'date' },
  ],

  sections: [{
    key: 'creditnotes',
    title: 'POS Credit Note Report List',
    totalsRow: true,
    columns: [
      { k: 'location', t: 'Location Name' },
      { k: 'creditNo', t: 'Credit No.' },
      { k: 'date', t: 'Transaction Date', f: 'date' },
      { k: 'finalTotal', t: 'Final Total', f: 'amount', total: true },
    ],
  }],
};
