'use client';
import ListView from '@/components/ListView';

/* Sales Persons - list. Columns are declared here, not fetched from a registry.

   Columns match the deployed screen exactly; Status is a form field only, so
   it is edited on the row but not shown as a column. */

const CONFIG = {
  title: "My Sales Person",
  basePath: '/admin/staff-management/staff/',
  slugPath: "salesperson",
  endpoint: '/api/sales-person',
  scope: ["business"],
  actionVariant: "dropdown",
  actionMenu: [
    { label: 'Edit', icon: 'pencil', to: (r) => '/admin/staff-management/staff/salesperson/' + r._id },
    { label: 'Delete', icon: 'trash', action: 'delete' },
  ],
  columns: [
    { k: "name", t: "Name" },
    { k: "email", t: "Email" },
    { k: "spCode", t: "SP Code" },
    { k: "isDefault", t: "Default", f: "yesno" },
  ],
};

export default function SalespersonListPage() {
  return <ListView cfg={CONFIG} />;
}
