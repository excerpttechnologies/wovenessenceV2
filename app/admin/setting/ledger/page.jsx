'use client';
import ListView from '@/components/ListView';

/* Ledgers - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Ledgers",
  basePath: '/admin/setting/',
  slugPath: "ledger",
  endpoint: '/api/ledger',
  scope: ["business"],
  columns: [
    { k: "name", t: "Name" },
    { k: "ledgerGroupId", t: "Group", f: "ref" },
    { k: "isActive", t: "Is Active", f: "activeText" },
    { k: "isDefault", t: "Default", f: "yesno" },
    { k: "balance", t: "Balance", f: "amount" },
    { k: "openingBalance", t: "Opening Balance" },
  ],
};

export default function LedgerListPage() {
  return <ListView cfg={CONFIG} />;
}
