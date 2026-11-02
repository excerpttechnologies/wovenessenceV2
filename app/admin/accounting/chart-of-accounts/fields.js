/* Form fields for the Chart of Accounts.

   Opening Balance is SIGNED, and the sign is the side: positive is a debit
   balance, negative a credit. That is why the label says so - an operator
   entering a supplier balance as "5000" would otherwise open every account
   on the wrong side. */

export const ACCOUNT_TYPE_OPTIONS = [
  { v: 'Asset', l: 'Asset' },
  { v: 'Liability', l: 'Liability' },
  { v: 'Equity', l: 'Equity' },
  { v: 'Income', l: 'Income' },
  { v: 'Expense', l: 'Expense' },
];

export const FIELDS = [
  {
    k: 'accountCode',
    label: 'Account Code (blank = next free number)',
    type: 'text',
    placeholder: 'e.g. 1000',
  },
  { k: 'accountName', label: 'Account Name', type: 'text', req: true },
  { k: 'accountType', label: 'Account Type', type: 'select', req: true, opts: ACCOUNT_TYPE_OPTIONS, def: 'Asset' },
  { k: 'parentAccountId', label: 'Parent Account (rolls up into)', type: 'ref', ref: 'accounts' },
  {
    k: 'openingBalance',
    label: 'Opening Balance (Dr +, Cr -)',
    type: 'number',
    def: 0,
    placeholder: '0.00',
  },
  {
    k: 'isActive',
    label: 'Is Active',
    type: 'radio',
    req: true,
    opts: [{ v: 'Active', l: 'Active' }, { v: 'Inactive', l: 'Inactive' }],
    def: 'Active',
  },
  { k: 'description', label: 'Description', type: 'textarea' },
];
