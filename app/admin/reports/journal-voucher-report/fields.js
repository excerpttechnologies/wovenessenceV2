const tiles = [
  { k: 'totalVouchers', label: 'Total Vouchers', icon: 'users', cls: 'bg-[#dce9ff]', f: 'count' },
  { k: 'totalLines', label: 'Total Lines', icon: 'list', cls: 'bg-[#dce9ff]', f: 'count' },
  { k: 'totalDebit', label: 'Total Debit', icon: 'plus', cls: 'bg-[#d9f3e7]', f: 'amount' },
  { k: 'totalCredit', label: 'Total Credit', icon: 'minus', cls: 'bg-[#fde4e7]', f: 'amount' },
  { k: 'difference', label: 'Difference', icon: 'calculator', cls: 'bg-[#dce9ff]', f: 'amount' },
];

const amount = (k, t) => ({ k, t, f: 'amount', total: true });

export const REPORT = {
  slug: 'journal-voucher-report',
  title: 'Journal Voucher Report',
  subtitle: 'Journal vouchers line by line or by voucher, with debit and credit totals.',
  perPage: 15,
  locationAll: true,
  filterLayout: 'grid',
  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'Date From', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'Date To', type: 'date', req: true, def: 'today' },
    { k: 'ledgerId', label: 'Ledger', type: 'ref', ref: 'accounts', all: 'All ledgers' },
    {
      k: 'ledgerGroup',
      label: 'Ledger Group',
      type: 'select',
      all: 'All Groups',
      opts: [
        { v: 'Asset', l: 'Asset' },
        { v: 'Liability', l: 'Liability' },
        { v: 'Equity', l: 'Equity' },
        { v: 'Income', l: 'Income' },
        { v: 'Expense', l: 'Expense' },
      ],
    },
    {
      k: 'drCr',
      label: 'Dr / Cr',
      type: 'select',
      def: 'both',
      opts: [
        { v: 'both', l: 'Debit and Credit' },
        { v: 'debit', l: 'Debit Only' },
        { v: 'credit', l: 'Credit Only' },
      ],
    },
  ],
  tabs: [
    {
      k: 'entry',
      label: 'Entry-wise',
      tiles,
      sections: [{
        key: 'entries',
        totalsRow: true,
        columns: [
          { k: 'voucherNo', t: 'Voucher No' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'location', t: 'Location' },
          { k: 'reference', t: 'Reference' },
          { k: 'ledger', t: 'Ledger' },
          amount('debit', 'Debit'),
          amount('credit', 'Credit'),
          { k: 'lineRemark', t: 'Line Remark' },
          { k: 'narration', t: 'Narration' },
        ],
      }],
    },
    {
      k: 'voucher',
      label: 'Voucher-wise',
      tiles,
      sections: [{
        key: 'vouchers',
        totalsRow: true,
        columns: [
          { k: 'voucherNo', t: 'Voucher No' },
          { k: 'date', t: 'Date', f: 'date' },
          { k: 'location', t: 'Location' },
          { k: 'reference', t: 'Reference' },
          amount('debit', 'Total Debit'),
          amount('credit', 'Total Credit'),
          { k: 'lineCount', t: 'Lines', f: 'count', total: true },
          amount('difference', 'Difference'),
          { k: 'narration', t: 'Narration' },
        ],
      }],
    },
  ],
};
