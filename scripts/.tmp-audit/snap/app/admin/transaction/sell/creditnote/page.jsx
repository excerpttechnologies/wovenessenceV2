'use client';
import ListView from '@/components/ListView';

/* Credit Notes - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Credit Notes",
  basePath: '/admin/',
  slugPath: "transaction/sell/creditnote",
  endpoint: '/api/sell-creditnote',
  scope: ["business","location","finYear"],
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "customerId", t: "Customer Name", f: "ref" },
    { k: "creditNoteCode", t: "Credit Note Code" },
    { k: "totalQty", t: "Total Qty", f: "amount" },
    { k: "createdAt", t: "Creadted On", f: "date" },
  ],
};

export default function TransactionSellCreditnoteListPage() {
  return <ListView cfg={CONFIG} />;
}
