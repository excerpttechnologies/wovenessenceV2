'use client';
import ListView from '@/components/ListView';

/* Purchase Groups - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Purchase Groups",
  basePath: '/admin/setting/',
  slugPath: "purchasegroup",
  endpoint: '/api/purchase-group',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  columns: [
    { k: "purchaseGroup", t: "Group Name" },
    { k: "businessId", t: "Business", f: "ref" },
    { k: "status", t: "Status" },
  ],
};

export default function PurchasegroupListPage() {
  return <ListView cfg={CONFIG} />;
}
