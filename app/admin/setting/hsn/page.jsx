'use client';
import ListView from '@/components/ListView';

/* HSN Codes - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "HSN Codes",
  basePath: '/admin/setting/',
  slugPath: "hsn",
  endpoint: '/api/hsn',
  scope: ["business"],
  columns: [
    { k: "code", t: "Code" },
    { k: "effectiveDate", t: "Effective Date", f: "date" },
    { k: "status", t: "Status" },
  ],
};

export default function HsnListPage() {
  return <ListView cfg={CONFIG} />;
}
