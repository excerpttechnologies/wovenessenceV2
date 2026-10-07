'use client';
import ListView from '@/components/ListView';

/* Sales Invoices - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Sales Invoices",
  basePath: '/admin/',
  slugPath: "transaction/sell/salesinvoice",
  endpoint: '/api/sell-salesinvoice',
  scope: ["business","location","finYear"],
  filters: [
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "salesInvoiceNo", t: "Sales Invoice No" },
    { k: "customerId", t: "Customer Name", f: "ref" },
    { k: "customerMobile", t: "Customer Mobile" },
    { k: "customerGstn", t: "Customer GST No" },
    { k: "deliveryChallanNo", t: "Delivery Challan No" },
    { k: "createdAt", t: "Creadted On", f: "date" },
  ],
};

export default function TransactionSellSalesinvoiceListPage() {
  return <ListView cfg={CONFIG} />;
}
