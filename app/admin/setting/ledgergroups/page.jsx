'use client';
import ListView from '@/components/ListView';

/* Ledger Groups - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Ledger Groups",
  basePath: '/admin/setting/',
  slugPath: "ledgergroups",
  endpoint: '/api/ledger-group',
  scope: ["business"],
  columns: [
    { k: "groupName", t: "Name" },
    { k: "parentGroupId", t: "Parent", f: "ref" },
    { k: "status", t: "Is Active" },
  ],
};

export default function LedgergroupsListPage() {
  return <ListView cfg={CONFIG} />;
}
