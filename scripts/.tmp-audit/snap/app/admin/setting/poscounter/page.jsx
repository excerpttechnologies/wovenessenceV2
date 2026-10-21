'use client';
import ListView from '@/components/ListView';

/* Pos Counters - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Cash Counters",
  basePath: '/admin/setting/',
  slugPath: "poscounter",
  endpoint: '/api/pos-counter',
  scope: ["business","location"],
  columns: [
    { k: "counterName", t: "Counter Name" },
    { k: "invoiceLayout", t: "Invoice Layout" },
    { k: "status", t: "Is Active" },
    { k: "repeatInvoice", t: "Repeat Invoice" },
    { k: "businessId", t: "Business", f: "ref" },
    { k: "locationId", t: "Location", f: "ref" },
  ],
};

export default function PoscounterListPage() {
  return <ListView cfg={CONFIG} />;
}
