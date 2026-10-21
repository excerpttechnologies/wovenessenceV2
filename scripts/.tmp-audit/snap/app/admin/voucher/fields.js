/* Voucher specs - one entry per voucher type.

   Plain module (no 'use client') so the API route imports the same rules the
   forms use: which side each role posts to, what the prefix is, and which
   Voucher Settings group feeds each dropdown.

   Adding a fourth voucher type is one entry here plus one page file. */

export const RECEIPT = 'Receipt';
export const PAYMENT = 'Payment';
export const CONTRA = 'Contra';

/* Every line's side is fixed by its ROLE, not typed by the user - a receipt
   always credits the customer and debits the bank. The form only asks for
   the amount, which is why each row shows one editable cell. */
export const ROLE_SIDE = {
  [RECEIPT]: { party: 'credit', bank: 'debit' },
  [PAYMENT]: { party: 'debit', bank: 'credit', discount: 'credit' },
  [CONTRA]: { to: 'debit', from: 'credit' },
};

export const SPECS = {
  /* ------------------------------------------------------------- receipt */
  [RECEIPT]: {
    type: RECEIPT,
    slug: 'receipt-vouchers',
    title: 'Receipt Vouchers',
    addTitle: 'Add Receipt Voucher',
    submitLabel: 'Submit Receipt Voucher',
    prefix: 'RV',
    partyLabel: 'Customer Name',
    /* the money-in column heading, and the badge shown for the unallocated
       part of the voucher */
    statusLabel: 'Advance',
    statusFilterLabel: 'Advance Status',
    partyFilterLabel: 'Customer Name / Mobile',
    partyFilterPlaceholder: 'Search by customer name or mobile',
    /* grid column order, left to right */
    columns: ['Ledger', 'Balance', 'Credit', 'Debit', 'Remarks', 'Action'],
    /* Voucher Settings holds Dr and Cr group lists per voucher type; each
       role reads the side it posts to, so the customer dropdown offers the
       groups ticked under "Party accounts credited". */
    roles: [
      {
        role: 'party', side: 'credit', settingSide: 'cr',
        placeholder: 'Search debtor...', fixed: true, adjust: true,
      },
      {
        role: 'bank', side: 'debit', settingSide: 'dr',
        placeholder: 'Search bank/cash...', removable: true,
      },
    ],
    addRowLabel: 'Add Row',
    addRowRole: 'bank',
    listColumns: [
      { k: 'voucherNo', t: 'Voucher Number' },
      { k: 'voucherDate', t: 'Date', f: 'date' },
      { k: 'partyName', t: 'Customer Name' },
      { k: 'totalAmount', t: 'Total Amount', f: 'amount' },
      { k: 'advance', t: 'Advance', f: 'amount' },
      { k: 'remark', t: 'Remark' },
    ],
    hasFilter: true,
  },

  /* ------------------------------------------------------------- payment */
  [PAYMENT]: {
    type: PAYMENT,
    slug: 'payment-vouchers',
    title: 'Payment Vouchers',
    addTitle: 'Add Payment Voucher',
    submitLabel: 'Submit Payment Voucher',
    prefix: 'PV',
    partyLabel: 'Supplier Name',
    statusLabel: 'Settlement',
    statusFilterLabel: 'Settlement Status',
    partyFilterLabel: 'Supplier Name / Mobile',
    partyFilterPlaceholder: 'Search by supplier name or mobile',
    columns: ['Ledger', 'Balance', 'Debit', 'Credit', 'Remarks', 'Action'],
    info: 'Understanding the supplier Balance: A negative balance means the business has an outstanding payable - this amount is still owed and needs to be paid to the supplier. A positive balance means the supplier already holds an advance with the business, so no payment may be required unless additional transactions exist.',
    roles: [
      {
        role: 'party', side: 'debit', settingSide: 'dr',
        placeholder: 'Search supplier...', fixed: true, adjust: true,
      },
      {
        role: 'bank', side: 'credit', settingSide: 'cr',
        placeholder: 'Search bank/cash...', removable: true,
      },
    ],
    addRowLabel: 'Add Payment Row',
    addRowRole: 'bank',
    /* a discount written off at the time of payment - credits a discount
       ledger so the supplier account still clears in full */
    extraRow: {
      role: 'discount', side: 'credit', settingSide: 'cr',
      label: 'Add Discount', placeholder: 'Search discount ledger...',
      badge: 'Discount', removable: true, anyLedger: true,
    },
    listColumns: [
      { k: 'voucherNo', t: 'Voucher Number' },
      { k: 'voucherDate', t: 'Date', f: 'date' },
      { k: 'partyName', t: 'Supplier Name' },
      { k: 'totalAmount', t: 'Total Amount', f: 'amount' },
      { k: 'settlement', t: 'Settlement', f: 'amount' },
      { k: 'remark', t: 'Remark' },
    ],
    hasFilter: true,
  },

  /* -------------------------------------------------------------- contra */
  [CONTRA]: {
    type: CONTRA,
    slug: 'contra-vouchers',
    title: 'Contra Vouchers',
    addTitle: 'Add Contra Voucher',
    submitLabel: 'Submit Contra Voucher',
    prefix: 'CV',
    columns: ['Account (Bank / Cash)', 'Balance', 'Debit', 'Credit', 'Remarks', 'Action'],
    info: 'A Contra Voucher transfers funds between your own Bank / Cash accounts. Money is debited to the To (destination) account and credited from the From (source) account(s).',
    roles: [
      {
        role: 'to', side: 'debit', settingSide: 'dr',
        placeholder: 'Search destination account...', badge: 'To · Dr',
        badgeTone: 'green', fixed: true,
      },
      {
        role: 'from', side: 'credit', settingSide: 'cr',
        placeholder: 'Search source account...', badge: 'From · Cr',
        badgeTone: 'red', removable: true,
      },
    ],
    addRowLabel: 'Add Source Account',
    addRowRole: 'from',
    listColumns: [
      { k: 'voucherNo', t: 'Voucher Number' },
      { k: 'voucherDate', t: 'Date', f: 'date' },
      { k: 'toName', t: 'To (Destination)' },
      { k: 'fromName', t: 'From (Source)' },
      { k: 'totalAmount', t: 'Total Amount', f: 'amount' },
      { k: 'remark', t: 'Remark' },
    ],
    /* the deployed contra list has no filter card */
    hasFilter: false,
  },
};

export const STATUS_OPTS = [
  { v: '', l: 'All Vouchers' },
  { v: 'open', l: 'Unadjusted only' },
  { v: 'adjusted', l: 'Fully adjusted' },
];

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v) => Math.round(num(v) * 100) / 100;
export const money = (v) => r2(v).toFixed(2);

/* A voucher is valid when both sides carry the same total and that total is
   not zero. Checked on the form so Submit can be disabled with a reason, and
   again on the server so it holds if the form is bypassed. */
export function totalsOf(lines) {
  const totalDebit = r2(lines.reduce((a, l) => a + num(l.debit), 0));
  const totalCredit = r2(lines.reduce((a, l) => a + num(l.credit), 0));
  return {
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit && totalDebit > 0,
    difference: r2(totalDebit - totalCredit),
    totalAmount: totalDebit,
  };
}
