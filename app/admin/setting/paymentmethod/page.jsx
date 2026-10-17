'use client';
import ListView from '@/components/ListView';

/* Payment Methods - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Payment Methods",
  basePath: '/admin/setting/',
  slugPath: "paymentmethod",
  endpoint: '/api/payment-method',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business","location"],
  columns: [
    { k: "paymentMethodName", t: "Method Name" },
    { k: "counterId", t: "Counter Name", f: "ref" },
    { k: "isActive", t: "Is Active", f: "yesno" },
    { k: "isDefault", t: "Is Default", f: "yesno" },
    { k: "isCash", t: "Is Cash", f: "yesno" },
    { k: "isLoyalty", t: "Is Loyalty", f: "yesno" },
    { k: "ledgerId", t: "Ledger Name", f: "ref" },
  ],
};

export default function PaymentmethodListPage() {
  return <ListView cfg={CONFIG} />;
}
