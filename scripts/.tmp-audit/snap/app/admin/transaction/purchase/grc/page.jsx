'use client';
import ListView from '@/components/ListView';

/* Goods Receiptc Challans - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Goods Receiptc Challans",
  basePath: '/admin/',
  slugPath: "transaction/purchase/grc",
  endpoint: '/api/purchase-grc',
  scope: ["business","location","finYear"],
  actionPosition: "left",
  actionVariant: "dropdown",
  /* second button in the card header, next to Refresh */
 
  /* Action ▾ menu, matching the deployed GRC list */
 actionMenu: [
  { label: 'Edit', icon: 'pencil', to: (r) => '/admin/transaction/purchase/grc/' + r._id },
  { label: 'Barcode Print', icon: 'barcode', to: (r) => '/admin/transaction/purchase/barcode-print/' + r._id },
  { label: 'GRC Print', icon: 'printer', to: (r) => '/admin/transaction/purchase/grc/print/' + r._id },
],
  filters: [
    { k: "supplierId", label: "Supplier", type: "ref", ref: "supplier", placeholder: "Select Supplier" },
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    {
  k: "supplierId",
  t: "Vendor Name",
  value: (r) => r.supplierName,
  f: "text",

  badge: (r) => r.purchaseInvoiceId ? { label: "verified", tone: "verified" } : null,
},
    { k: "grcNumber", t: "GRC NO" },
    { k: "grcDate", t: "GRC Date", f: "date" },
    { k: "logisticId", t: "Logistic No", f: "ref" },
    { k: "purchaseGroupId", t: "Purchase Group", f: "ref" },
    { k: "occasion", t: "Occasion" },
    { k: "agentId", t: "Agent", f: "ref" },
    { k: "vendorDocNo", t: "Vendor Doc No" },
    { k: "purchaseTermId", t: "Purchase Term", f: "ref" },
    { k: "taxable", t: "Taxable", f: "amount" },
    { k: "totalQuantity", t: "Total Quantity", f: "amount" },
    { k: "gst", t: "GST", f: "amount" },
    { k: "netAmount", t: "Net Amount", f: "amount" },
  ],
};

export default function TransactionPurchaseGrcListPage() {
  return <ListView cfg={CONFIG} />;
}