'use client';
import ListView from '@/components/ListView';

/* POS Returns - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "POS Returns",
  basePath: '/admin/',
  slugPath: "transaction/sell/pos-return",
  endpoint: '/api/sell-pos-return',
  scope: ["business","location","finYear"],
  addHref: '/admin/transaction/sell/pos-return/add',
  actionPosition: "left",
  actionVariant: "dropdown",
  columns: [
    { k: "date", t: "Date", f: "date" },
    { k: "invoiceNo", t: "Invoice No" },
    { k: "parentInvoice", t: "Parent Invoice" },
    { k: "customerId", t: "Customer Name", f: "ref" },
    { k: "paymentStatus", t: "Payment Status" },
    { k: "returnedCount", t: "Items" },
    { k: "totalAmount", t: "Total Amount", f: "amount" },
    { k: "refundAmount", t: "Refunded", f: "amount" },
    { k: "reason", t: "Reason" },
    { k: "processedBy", t: "Processed By" },
    { k: "locationId", t: "Location", f: "ref" },
  ],
};

export default function TransactionSellPosreturnListPage() {
  return <ListView cfg={CONFIG} />;
}
