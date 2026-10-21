'use client';
import ListView from '@/components/ListView';
import { TABS } from './tabs';

/* Suppliers - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Suppliers",
  basePath: '/admin/contact/',
  slugPath: "supplier",
  endpoint: '/api/supplier',
  gstLookup: true,
  scope: ["business"],
  formMode: "tabs",
  actionPosition: "left",
  actionVariant: "dropdown",
  columns: [
    { k: "businessName", t: "Business Name" },
    { k: "contactId", t: "Supplier No" },
    { k: "firstName", t: "Name" },
    { k: "billingMobile", t: "Mobile" },
    { k: "billingEmail", t: "Email" },
    { k: "billingAddressLine1", t: "Address" },
  ],
};

export default function SupplierListPage() {
  return <ListView cfg={CONFIG} />;
}
