/* Accounts > Profit & Loss - spec.

   Income less expenses over a window. The two tables are the two sides of
   that subtraction, so each carries its own total and the result is on the
   tiles. */

export const REPORT = {
  slug: 'profit-loss',
  title: 'Profit & Loss',
  subtitle: 'Income less expenses for the period.',
  filterTitle: 'Report Filters',
  hint: 'Leave the dates blank to use the financial year on the top bar.',
  paginated: false,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
  ],

  tiles: [
    { k: 'totalIncome', label: 'Total Income', icon: 'download', cls: 'bg-[#90ddc4]' },
    { k: 'totalExpenses', label: 'Total Expenses', icon: 'upload', cls: 'bg-[#f4a7bb]' },
    { k: 'netProfit', label: 'Net Profit', icon: 'chart', cls: 'bg-[#a9dfe8]' },
    { k: 'netLoss', label: 'Net Loss', icon: 'calculator', cls: 'bg-[#e3c765]' },
  ],

  sections: [
    {
      key: 'income',
      title: 'Income',
      totalsRow: true,
      columns: [
        { k: 'accountCode', t: 'Code' },
        { k: 'accountName', t: 'Account' },
        { k: 'group', t: 'Group' },
        { k: 'amount', t: 'Amount', f: 'amount', total: true },
      ],
    },
    {
      key: 'expenses',
      title: 'Expenses',
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
