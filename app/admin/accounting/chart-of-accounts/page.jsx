'use client';
import ListView from '@/components/ListView';

/* Accounts > Chart of Accounts - list.

   This is the accounting chart, not the party Ledger master: one row per line
   of the books that money is posted to. */

const CONFIG = {
  title: 'Chart of Accounts',
  basePath: '/admin/accounting/',
  slugPath: 'chart-of-accounts',
  endpoint: '/api/accounting/accounts',
  pager: 'numbered',
  sortable: true,
  scope: ['business', 'location'],
  columns: [
    { k: 'accountCode', t: 'Code' },
    { k: 'accountName', t: 'Account Name' },
    { k: 'accountType', t: 'Type' },
    { k: 'openingBalance', t: 'Opening Balance', f: 'amount' },
    { k: 'balanceType', t: 'Side' },
    { k: 'isActive', t: 'Status', f: 'activeText' },
  ],
  filters: [
    {
      k: 'accountType',
      label: 'Account Type',
      type: 'select',
      all: 'All Types',
      opts: [
        { v: 'Asset', l: 'Asset' },
        { v: 'Liability', l: 'Liability' },
        { v: 'Equity', l: 'Equity' },
        { v: 'Income', l: 'Income' },
        { v: 'Expense', l: 'Expense' },
      ],
    },
    {
      k: 'active',
      label: 'Status',
      type: 'select',
      all: 'All',
      opts: [{ v: '1', l: 'Active only' }],
    },
  ],
};

export default function ChartOfAccountsPage() {
  return <ListView cfg={CONFIG} />;
}
