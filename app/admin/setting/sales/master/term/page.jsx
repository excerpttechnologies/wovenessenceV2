'use client';
import ListView from '@/components/ListView';

/* All Sales Term Master - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "All Sales Term Master",
  basePath: '/admin/setting/',
  slugPath: "sales/master/term",
  endpoint: '/api/sales-term',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  columns: [
    { k: "name", t: "Name" },
  ],
};

export default function SalesmastertermListPage() {
  return <ListView cfg={CONFIG} />;
}
