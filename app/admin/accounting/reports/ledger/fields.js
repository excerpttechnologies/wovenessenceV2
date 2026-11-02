/* Accounts > Ledger - spec.

   One account's book, with the running balance that continues across pages.
   The account is required, so the report stays empty until one is picked
   rather than opening on an error. */

export const REPORT = {
  slug: 'ledger',
  title: 'Ledger',
  subtitle: 'Every posting to one account, with its running balance.',
  filterTitle: 'Ledger Filters',
  hint: 'Pick an account, then Search. Leave the dates blank to see the financial year.',
  searchOnly: true,
  perPage: 25,

  filters: [
    { k: 'accountId', label: 'Account', type: 'ref', ref: 'accounts', req: true, placeholder: 'Select Account' },
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
  ],

  tiles: [
    { k: 'opening', label: 'Opening Balance', icon: 'register', cls: 'bg-[#a9dfe8]' },
    { k: 'debit', label: 'Total Debit', icon: 'download', cls: 'bg-[#90ddc4]' },
    { k: 'credit', label: 'Total Credit', icon: 'upload', cls: 'bg-[#f4a7bb]' },
    { k: 'closing', label: 'Closing Balance', icon: 'ledger', cls: 'bg-[#e3c765]' },
  ],

  sections: [{
    key: 'ledger',
    title: 'Ledger',
    totalsRow: true,
    columns: [
      { k: 'date', t: 'Date', f: 'date' },
      { k: 'reference', t: 'Reference' },
      { k: 'narration', t: 'Narration' },
      { k: 'debit', t: 'Debit', f: 'amount', total: true },
      { k: 'credit', t: 'Credit', f: 'amount', total: true },
      { k: 'balance', t: 'Balance', f: 'amount' },
      { k: 'balanceType', t: 'Side' },
    ],
  }],
};
