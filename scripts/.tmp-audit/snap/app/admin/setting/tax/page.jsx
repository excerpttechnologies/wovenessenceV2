'use client';
import ListView from '@/components/ListView';

/* All Tax - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "All Tax",
  basePath: '/admin/setting/',
  slugPath: "tax",
  endpoint: '/api/tax',
  scope: ["business"],
  columns: [
    { k: "taxName", t: "Tax Name" },
    { k: "igst", t: "IGST" },
    { k: "cgst", t: "CGST" },
    { k: "sgst", t: "SGST" },
    { k: "cess", t: "CESS" },
    { k: "status", t: "Status" },
  ],
};

export default function TaxListPage() {
  return <ListView cfg={CONFIG} />;
}
