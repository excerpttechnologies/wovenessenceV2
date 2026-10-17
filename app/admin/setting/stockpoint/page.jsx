'use client';
import ListView from '@/components/ListView';

/* Stock Points - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Stock Points",
  basePath: '/admin/setting/',
  slugPath: "stockpoint",
  endpoint: '/api/stock-point',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business","location"],
  columns: [
    { k: "stockPoint", t: "Stockpoint Name" },
    { k: "type", t: "Type Name" },
    { k: "status", t: "Status" },
    { k: "parentId", t: "Parent", f: "ref" },
  ],
};

export default function StockpointListPage() {
  return <ListView cfg={CONFIG} />;
}
