'use client';
import ListView from '@/components/ListView';
import { TABS } from './tabs';

/* Customers - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Customers",
  basePath: '/admin/contact/',
  slugPath: "customer",
  endpoint: '/api/customer',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  formMode: "tabs",
  nowrapHead: true,
  actionPosition: "right",
  actionVariant: "icons",
  actionIcons: ["view", "edit", "delete"],
  columns: [
    { k: "businessName", t: "Business Name" },
    { k: "contactId", t: "Contact ID" },
    { k: "firstName", t: "Name" },
    { k: "billingMobile", t: "Mobile" },
    { k: "billingEmail", t: "Email" },
    { k: "billingAddressLine1", t: "Address" },
  ],
};

export default function CustomerListPage() {
  return <ListView cfg={CONFIG} />;
}
