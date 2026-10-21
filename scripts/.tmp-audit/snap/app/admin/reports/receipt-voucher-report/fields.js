/* Receipt Voucher Report - spec.

   Money in. One row per Receipt Voucher, with the amount split across the
   rails it arrived on: Bank, Cash and UPI. A voucher line names a ledger
   rather than a rail, so the split is derived server-side from each ledger's
   name and group chain - see ledgerBuckets() in app/api/reports/[slug].

   Advance Amount is what the voucher has not yet been allocated against an
   invoice. Allocation was never built (Voucher.adjustedAmount is always 0),
   so today that equals the total and Advance Status always reads "Advance".
   The column is computed properly so it is correct the moment allocation
   lands. */

export const STATUS_OPTS = [
  { v: 'open', l: 'Unadjusted only' },
  { v: 'adjusted', l: 'Fully adjusted' },
];

export const REPORT = {
  slug: 'receipt-voucher-report',
  title: 'Receipt Voucher Report',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'ledgerId', label: 'Customer / Debtor Ledger', type: 'ref', ref: 'ledger', all: 'All customers' },
    { k: 'status', label: 'Advance Status', type: 'select', opts: STATUS_OPTS, all: 'All Vouchers' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
  ],

  sections: [{
    key: 'receipts',
    totalsRow: true,
    columns: [
      { k: 'voucherNo', t: 'Voucher No' },
      { k: 'date', t: 'Date', f: 'date' },
      { k: 'partyName', t: 'Customer Name' },
      { k: 'total', t: 'Total Amount', f: 'amount', total: true },
      { k: 'bank', t: 'Bank', f: 'amount', total: true },
      { k: 'cash', t: 'Cash', f: 'amount', total: true },
      { k: 'upi', t: 'UPI', f: 'amount', total: true },
      { k: 'open', t: 'Advance Amount', f: 'amount', total: true },
      { k: 'status', t: 'Advance Status' },
    ],
  }],
};
