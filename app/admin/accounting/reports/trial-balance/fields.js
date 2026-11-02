/* Accounts > Trial Balance - spec.

   Opening, movement and closing for every account with any of the three.
   A balanced set of books shows identical closing debit and credit totals;
   the difference tile is there so an unbalanced one is obvious. */

export const REPORT = {
  slug: 'trial-balance',
  title: 'Trial Balance',
  subtitle: 'Opening, movement and closing balances for every account.',
  filterTitle: 'Report Filters',
  hint: 'Leave the dates blank to use the financial year on the top bar.',
  perPage: 25,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
  ],

  tiles: [
    { k: 'accounts', label: 'Accounts', icon: 'ledger', cls: 'bg-[#a9dfe8]', f: 'dash' },
    { k: 'closingDebit', label: 'Closing Debit', icon: 'download', cls: 'bg-[#90ddc4]' },
    { k: 'closingCredit', label: 'Closing Credit', icon: 'upload', cls: 'bg-[#f4a7bb]' },
    { k: 'difference', label: 'Difference', icon: 'calculator', cls: 'bg-[#e3c765]' },
  ],

  sections: [{
    key: 'trial-balance',
    title: 'Trial Balance',
    totalsRow: true,
    columns: [
      { k: 'accountCode', t: 'Code' },
      { k: 'accountName', t: 'Account' },
      { k: 'accountType', t: 'Type' },
      { k: 'openingDebit', t: 'Opening Dr', f: 'amount', total: true },
      { k: 'openingCredit', t: 'Opening Cr', f: 'amount', total: true },
      { k: 'periodDebit', t: 'Debit', f: 'amount', total: true },
      { k: 'periodCredit', t: 'Credit', f: 'amount', total: true },
      { k: 'closingDebit', t: 'Closing Dr', f: 'amount', total: true },
      { k: 'closingCredit', t: 'Closing Cr', f: 'amount', total: true },
    ],
  }],
};
