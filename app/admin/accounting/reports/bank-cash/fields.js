/* Accounts > Bank & Cash - spec.

   One table per cash / bank account. The API decides how many tables come
   back (a business may have one till and three banks), so the spec declares
   the COLUMNS once and the response names each table - `dynamicSections`. */

export const REPORT = {
  slug: 'bank-cash',
  title: 'Bank & Cash',
  subtitle: 'Receipts and payments through each cash and bank account.',
  filterTitle: 'Report Filters',
  hint: 'Leave the dates blank to use the financial year on the top bar.',
  paginated: false,
  dynamicSections: true,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
  ],

  tiles: [
    { k: 'cash', label: 'Cash Balance', icon: 'cash', cls: 'bg-[#90ddc4]' },
    { k: 'bank', label: 'Bank Balance', icon: 'bank', cls: 'bg-[#a9dfe8]' },
    { k: 'receipts', label: 'Total Receipts', icon: 'download', cls: 'bg-[#e3c765]' },
    { k: 'payments', label: 'Total Payments', icon: 'upload', cls: 'bg-[#f4a7bb]' },
  ],

  sections: [{
    key: 'bank-cash',
    title: 'Bank & Cash',
    totalsRow: true,
    columns: [
      { k: 'date', t: 'Date', f: 'date' },
      { k: 'reference', t: 'Reference' },
      { k: 'narration', t: 'Narration' },
      { k: 'debit', t: 'Receipt', f: 'amount', total: true },
      { k: 'credit', t: 'Payment', f: 'amount', total: true },
      { k: 'balance', t: 'Balance', f: 'amount' },
      { k: 'balanceType', t: 'Side' },
    ],
  }],
};
