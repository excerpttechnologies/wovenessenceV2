'use client';
import MappingView from '@/components/MappingView';

/* Ledger Group Mapping - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Ledger Group Mapping",
  basePath: '/admin/setting/',
  slugPath: "ledgergroupmapping",
  endpoint: '/api/ledger-group-mapping',
  scope: ["business"],
  mapping: {
    "keyHeader": "Purpose",
    "valueHeader": "Ledger Group",
    "ref": "ledgergroups",
    "rows": [
      "Tax Master",
      "Purchase Charge Master",
      "Sales Charge Master",
      "Loyalty Point",
      "Payment Method",
      "Cash Payment Method",
      "Purchases Accounts",
      "Purchases Return",
      "TDS",
      "Sales Accounts",
      "Sales Return",
      "Supplier Payment",
      "Round Off"
    ]
  },
};

export default function LedgergroupmappingPage() {
  return <MappingView cfg={CONFIG} />;
}
