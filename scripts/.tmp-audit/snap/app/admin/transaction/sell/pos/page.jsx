'use client';
import ListView from '@/components/ListView';

/* Pos - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Pos",
  basePath: '/admin/',
  slugPath: "transaction/sell/pos",
  endpoint: '/api/sell-pos',
  scope: ["business","location","finYear"],
  addHref: "/admin/pos/add",
  actionPosition: "left",
  actionVariant: "dropdown",
  actionMenu: [
    { label: "View", icon: "eye", to: (row) => `/admin/transaction/sell/pos/view/${row._id}` },
    { label: "View Payments", icon: "ledger", to: (row) => `/admin/transaction/sell/pos/payment/${row._id}` },
    { label: "Print Invoice", icon: "printer", to: (row) => `/admin/transaction/sell/pos/print/${row._id}` },
  ],
  filters: [
    { k: "invoiceNo", label: "Invoice No", type: "text" },
    { k: "startDate", label: "Start Date", type: "date" },
    { k: "endDate", label: "End Date", type: "date" },
  ],
  columns: [
    { k: "businessName", t: "Business" },
    { k: "locationName", t: "Location" },
    { k: "date", t: "Date", f: "date" },
    { k: "invoiceNo", t: "Invoice No" },
    { k: "counterName", t: "Counter" },
    { k: "customerName", t: "Customer Name" },
    { k: "customerContact", t: "Customer Contact" },
    { k: "exempted", t: "Exempted", f: "yesno" },
    { k: "billingType", t: "Billing Type" },
    { k: "paymentStatus", t: "Payment Status" },
    { k: "totalAmount", t: "Total Amount", f: "amount" },
    { k: "paid", t: "Paid", f: "amount" },
    { k: "sellDue", t: "Sell Due", f: "amount" },
  ],
};

export default function TransactionSellPosListPage() {
  return <ListView cfg={CONFIG} />;
}
