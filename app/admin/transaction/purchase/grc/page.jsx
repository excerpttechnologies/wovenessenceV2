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
    /* The purchase term (Before Tax / After Tax) is stored on the GRC as
       freightMode - the form's Before Tax / After Tax / N/A select, and where
       the historical import put the workbook's "Purchase Term". No GRC ever
       had a purchaseTermId, so this column used to be blank on every row. */
    { k: "freightMode", t: "Purchase Term" },
    /* TAXABLE + GST = NET AMOUNT on every row.

       All three come from the one resolution the list API runs through
       lib/grcMoney.js (grcMoney): the stored net amount, then the GST AMOUNT
       - never a percentage, and never the sum of percentages a header written
       before 2026-09-17 holds in that field - and then taxable, read back out
       of the net amount as net - GST. Nothing is worked out again here, so
       these columns cannot drift from the screens that open the same GRC. */
    { k: "taxable", t: "Taxable", f: "amount", value: (r) => r.taxable || 0 },
    { k: "totalQuantity", t: "Total Quantity", f: "amount" },
    { k: "gstAmount", t: "GST", f: "amount", value: (r) => r.gstAmount || 0 },
    { k: "netAmount", t: "Net Amount", f: "amount", value: (r) => r.netAmount || 0 },
  ],
};

export default function TransactionPurchaseGrcListPage() {
  return <ListView cfg={CONFIG} />;
}