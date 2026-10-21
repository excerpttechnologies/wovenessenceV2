/* Payment Voucher Report - spec.

   Money out. The mirror of the Receipt report, with two differences the
   deployed screen makes:

     - the third money column is Discount, not UPI. That is the "Add Discount"
       row on the payment form - a write-off credited to a discount ledger so
       the supplier's account still clears in full.
     - the unallocated column is called On Account rather than Advance.

   Same allocation caveat: Voucher.adjustedAmount is always 0 today, so
   Settlement Status reads "On Account" for every voucher. */

export const STATUS_OPTS = [
  { v: 'open', l: 'Unsettled only' },
  { v: 'adjusted', l: 'Fully settled' },
];

export const REPORT = {
  slug: 'payment-voucher-report',
  title: 'Payment Voucher Report',
  perPage: 15,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'ledgerId', label: 'Supplier / Creditor Ledger', type: 'ref', ref: 'ledger', all: 'All suppliers' },
    { k: 'status', label: 'Settlement Status', type: 'select', opts: STATUS_OPTS, all: 'All Vouchers' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
  ],

  sections: [{
    key: 'payments',
    totalsRow: true,
    columns: [
      { k: 'voucherNo', t: 'Voucher No' },
      { k: 'date', t: 'Date', f: 'date' },
      { k: 'partyName', t: 'Supplier' },
      { k: 'total', t: 'Total Amount', f: 'amount', total: true },
      { k: 'bank', t: 'Bank', f: 'amount', total: true },
      { k: 'cash', t: 'Cash', f: 'amount', total: true },
      { k: 'discount', t: 'Discount', f: 'amount', total: true },
      { k: 'open', t: 'On Account', f: 'amount', total: true },
      { k: 'status', t: 'Settlement Status' },
    ],
  }],
};
