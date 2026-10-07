'use client';
import ListView from '@/components/ListView';
import PurchaseInvoiceView from '@/components/PurchaseInvoiceView';
import PurchaseInvoicePrintView from '@/components/PurchaseInvoicePrintView';

/* Purchase Invoices - list. Columns declared here, not fetched from a registry.

   ViewDialog makes the eye icon open a read-only dialog instead of pushing
   the record route, which is the edit form. The pencil still edits. */

const CONFIG = {
  ViewDialog: PurchaseInvoiceView,
  PrintDialog: PurchaseInvoicePrintView,
  /* view · print · delete, matching the deployed row - there is no pencil
     here. An invoice that has been raised is viewed or reprinted, not edited
     in place; the edit route still exists for anyone who navigates to it. */
  actionIcons: ['view', 'print', 'delete'],
  title: "Purchase Invoices",
  basePath: '/admin/',
  slugPath: "transaction/purchase/invoice",
  endpoint: '/api/purchase-invoice',
  scope: ["business","location","finYear"],
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "purchaseInvoiceNo", t: "Purchase Invoice" },
    { k: "purchaseDate", t: "Purchase Date", f: "date" },
    { k: "supplierId", t: "Supplier Name", f: "ref" },
    { k: "grcNumber", t: "GRC NO" },
    { k: "netPurchaseAmt", t: "Net Purchase Amt", f: "amount" },
    { k: "totalPayable", t: "Total Payable", f: "amount" },
  ],
};

export default function TransactionPurchaseInvoiceListPage() {
  return <ListView cfg={CONFIG} />;
}
