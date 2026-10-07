'use client';
import ListView from '@/components/ListView';

/* Stock Points - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Stock Points",
  basePath: '/admin/setting/',
  slugPath: "stockpoint",
  endpoint: '/api/stock-point',
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
