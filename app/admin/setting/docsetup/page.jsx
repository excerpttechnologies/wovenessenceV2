'use client';
import ListView from '@/components/ListView';

/* Doc Setups - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Doc Setups",
  basePath: '/admin/setting/',
  slugPath: "docsetup",
  endpoint: '/api/doc-setup',
  scope: ["business","finYear"],
  columns: [
    { k: "documentName", t: "Name" },
    { k: "documentType", t: "Type" },
    { k: "prefix", t: "Prefix" },
    { k: "startFrom", t: "Start From" },
    { k: "validity", t: "Validity" },
    { k: "finYear", t: "Fin Year" },
  ],
};

export default function DocsetupListPage() {
  return <ListView cfg={CONFIG} />;
}
