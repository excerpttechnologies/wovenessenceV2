'use client';
import ListView from '@/components/ListView';

/* Debit Notes - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Debit Notes",
  basePath: '/admin/',
  slugPath: "transaction/purchase/debitnote",
  endpoint: '/api/purchase-debitnote',
  scope: ["business","location","finYear"],
  actionIcons: ["view","delete","print"],
  actionExtraButton: "label",
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "debitNoteNo", t: "Debit Note No" },
    { k: "debitCreadted", t: "Debit Creadted", f: "date" },
    { k: "supplierId", t: "Supplier", f: "ref" },
    { k: "grtNo", t: "GRT NO" },
    { k: "qty", t: "Qty", f: "amount" },
    { k: "value", t: "Value", f: "amount" },
    { k: "remaining", t: "Remaining", f: "amount" },
    { k: "adjStatus", t: "Adj. Status", f: "pill" },
    { k: "adjustedAgainstPi", t: "Adjusted Against (PI)", f: "dash" },
  ],
};

export default function TransactionPurchaseDebitnoteListPage() {
  return <ListView cfg={CONFIG} />;
}
