'use client';
import ListView from '@/components/ListView';

/* B2B Invoice - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "B2B Invoice",
  basePath: '/admin/',
  slugPath: "transaction/sell/b2binvoice",
  endpoint: '/api/sell-b2binvoice',
  scope: ["business","location","finYear"],
  showAdd: false,
  columns: [
    { k: "locationId", t: "Location", f: "ref" },
    { k: "invoiceNo", t: "Invoice No" },
    { k: "customerId", t: "Customer Name", f: "ref" },
    { k: "customerContact", t: "Customer Contact" },
    { k: "gstNo", t: "GST No" },
    { k: "state", t: "State" },
    { k: "totalTaxable", t: "Total Taxable", f: "amount" },
    { k: "totalIgst", t: "Total IGST Amount", f: "amount" },
    { k: "totalCgst", t: "Total CGST Amount", f: "amount" },
    { k: "totalSgst", t: "Total SGST Amount", f: "amount" },
  ],
};

export default function TransactionSellB2binvoiceListPage() {
  return <ListView cfg={CONFIG} />;
}
