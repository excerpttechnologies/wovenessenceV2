'use client';
import VoucherSettingsView from '@/components/VoucherSettingsView';

/* Voucher Settings — Debtor / Creditor Ledger Groups - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Voucher Settings — Debtor / Creditor Ledger Groups",
  basePath: '/admin/setting/',
  slugPath: "voucher-setting",
  endpoint: '/api/voucher-setting',
  scope: ["business"],
  voucher: {
    "ref": "ledgergroups",
    "note": "Ledgers under the selected groups (including their sub-groups) become available in the matching voucher dropdowns. An empty section means no ledgers will be offered for that side of the voucher.",
    "groups": [
      {
        "k": "receipt",
        "title": "Receipt Voucher",
        "sub": "Money received from customers (money-in voucher).",
        "drCap": "Accounts receiving money (Cash / Bank)",
        "crCap": "Party accounts credited (Customers / Sundry Debtors)"
      },
      {
        "k": "payment",
        "title": "Payment Voucher",
        "sub": "Money paid out to suppliers (money-out voucher).",
        "drCap": "Party accounts debited (Suppliers / Sundry Creditors)",
        "crCap": "Accounts paying money out (Cash / Bank)"
      },
      {
        "k": "contra",
        "title": "Contra Voucher",
        "sub": "Fund transfers between the business's own cash/bank accounts.",
        "drCap": "Destination accounts — money in (Cash / Bank)",
        "crCap": "Source accounts — money out (Cash / Bank)"
      }
    ]
  },
};

export default function VouchersettingPage() {
  return <VoucherSettingsView cfg={CONFIG} />;
}
