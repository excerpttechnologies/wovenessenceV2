'use client';
import ListView from '@/components/ListView';

/* Goods Return Notes - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Goods Return Notes",
  basePath: '/admin/',
  slugPath: "transaction/purchase/grt",
  endpoint: '/api/purchase-grt',
  scope: ["business","location","finYear"],
  actionIcons: ["view", "edit"],
  viewModal: true,
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "grtNo", t: "GRT No" },
    { k: "grtDate", t: "GRT Date", f: "date" },
    { k: "supplierId", t: "Supplier Name", f: "ref" },
    { k: "grcNumber", t: "GRC NO" },
    { k: "qty", t: "Qty", f: "amount" },
    { k: "itemCount", t: "Items", f: "amount" },
    { k: "taxable", t: "Taxable", f: "amount" },
    { k: "gst", t: "GST", f: "amount" },
    { k: "netAmount", t: "Net Amount", f: "amount" },
  ],
};

export default function TransactionPurchaseGrtListPage() {
  return <ListView cfg={CONFIG} />;
}
