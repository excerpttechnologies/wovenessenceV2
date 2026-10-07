'use client';
import ListView from '@/components/ListView';

/* Sales Returns - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Sales Returns",
  basePath: '/admin/',
  slugPath: "transaction/sell/salereturn",
  endpoint: '/api/sell-salereturn',
  scope: ["business","location","finYear"],
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "customerId", t: "Customer Name", f: "ref" },
    { k: "salesReturnNo", t: "Sales Return No" },
    { k: "createdAt", t: "Creadted On", f: "date" },
  ],
};

export default function TransactionSellSalereturnListPage() {
  return <ListView cfg={CONFIG} />;
}
