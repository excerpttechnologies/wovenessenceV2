'use client';
import ListView from '@/components/ListView';

/* All Purchase Term Masters - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "All Purchase Term Masters",
  basePath: '/admin/setting/',
  slugPath: "purchase/master/term",
  endpoint: '/api/purchase-term',
  scope: ["business"],
  columns: [
    { k: "name", t: "Name" },
  ],
};

export default function PurchasemastertermListPage() {
  return <ListView cfg={CONFIG} />;
}
