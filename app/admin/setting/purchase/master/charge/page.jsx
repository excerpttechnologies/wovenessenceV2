'use client';
import ListView from '@/components/ListView';

/* All Purchase Charge Master - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "All Purchase Charge Master",
  basePath: '/admin/setting/',
  slugPath: "purchase/master/charge",
  endpoint: '/api/purchase-charge',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  columns: [
    { k: "chargeName", t: "Name" },
    { k: "chargeType", t: "Type" },
    { k: "status", t: "Status" },
    { k: "gstPosition", t: "GST Position" },
  ],
};

export default function PurchasemasterchargeListPage() {
  return <ListView cfg={CONFIG} />;
}
