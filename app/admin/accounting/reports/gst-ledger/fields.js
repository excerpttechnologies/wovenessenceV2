/* Accounts > GST Ledger - spec.

   The tax accounts' movement: input GST debited (claimable) and output GST
   credited (payable). Accounts come from Accounting Settings first, with a
   name fallback for a business that has not mapped them - the report says so
   when it falls back. */

export const REPORT = {
  slug: 'gst-ledger',
  title: 'GST Ledger',
  subtitle: 'Input and output GST accounts, with their movement for the period.',
  filterTitle: 'Report Filters',
  hint: 'Leave the dates blank to use the financial year on the top bar.',
  perPage: 25,

  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
  ],

  tiles: [
    { k: 'inputDebit', label: 'Input GST (Dr)', icon: 'download', cls: 'bg-[#90ddc4]' },
    { k: 'outputCredit', label: 'Output GST (Cr)', icon: 'upload', cls: 'bg-[#f4a7bb]' },
    { k: 'net', label: 'Net Payable', icon: 'calculator', cls: 'bg-[#e3c765]' },
    { k: 'accounts', label: 'Tax Accounts', icon: 'percent', cls: 'bg-[#a9dfe8]', f: 'dash' },
  ],

  sections: [{
    key: 'gst',
    title: 'GST Accounts',
    totalsRow: true,
    columns: [
      { k: 'accountCode', t: 'Code' },
      { k: 'accountName', t: 'Account' },
      { k: 'role', t: 'Input / Output' },
      { k: 'mapped', t: 'Source' },
      { k: 'opening', t: 'Opening', f: 'amount' },
      { k: 'debit', t: 'Debit', f: 'amount', total: true },
      { k: 'credit', t: 'Credit', f: 'amount', total: true },
      { k: 'closing', t: 'Closing', f: 'amount', total: true },
    ],
  }],
};
