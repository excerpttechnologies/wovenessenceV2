/* Accounts > Balance Sheet - spec.

   Assets, liabilities and equity as at a date. The year's result is its own
   row in Equity, so the income and expense accounts are not repeated here.
   The difference tile is Assets - (Liabilities + Equity): zero on balanced
   books, and shown rather than adjusted away when it is not. */

export const REPORT = {
  slug: 'balance-sheet',
  title: 'Balance Sheet',
  subtitle: 'Assets, liabilities and equity as at a date.',
  filterTitle: 'Report Filters',
  hint: 'Leave the dates blank to use the financial year on the top bar.',
  paginated: false,

  filters: [
    { k: 'fromDate', label: 'Period From', type: 'date' },
    { k: 'toDate', label: 'As At', type: 'date' },
  ],

  tiles: [
    { k: 'totalAssets', label: 'Total Assets', icon: 'box', cls: 'bg-[#a9dfe8]' },
    { k: 'totalLiabilities', label: 'Total Liabilities', icon: 'card', cls: 'bg-[#f4a7bb]' },
    { k: 'totalEquity', label: 'Total Equity', icon: 'accounts', cls: 'bg-[#90ddc4]' },
    { k: 'difference', label: 'Difference', icon: 'calculator', cls: 'bg-[#e3c765]' },
  ],

  sections: [
    {
      key: 'assets',
      title: 'Assets',
      totalsRow: true,
      columns: [
        { k: 'accountCode', t: 'Code' },
        { k: 'accountName', t: 'Account' },
        { k: 'group', t: 'Group' },
        { k: 'amount', t: 'Amount', f: 'amount', total: true },
      ],
    },
    {
      key: 'liabilities',
      title: 'Liabilities',
      totalsRow: true,
      columns: [
        { k: 'accountCode', t: 'Code' },
        { k: 'accountName', t: 'Account' },
        { k: 'group', t: 'Group' },
        { k: 'amount', t: 'Amount', f: 'amount', total: true },
      ],
    },
    {
      key: 'equity',
      title: 'Equity',
      totalsRow: true,
      columns: [
        { k: 'accountCode', t: 'Code' },
        { k: 'accountName', t: 'Account' },
        { k: 'group', t: 'Group' },
        { k: 'amount', t: 'Amount', f: 'amount', total: true },
      ],
    },
  ],
};
