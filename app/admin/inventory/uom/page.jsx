'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Unit of Measurements - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Unit of Measurements",
  basePath: '/admin/inventory/',
  slugPath: "uom",
  endpoint: '/api/uom',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  addTitle: "Add Unit of Measurement",
  formMode: "modal",
  columns: [
    { k: "name", t: "Name" },
    { k: "shortName", t: "Short Name" },
    { k: "allowDecimal", t: "Allow Decimal" },
    { k: "defaultValue", t: "Default Value" },
    { k: "businessId", t: "Business", f: "ref" },
  ],
  fields: FIELDS,
};

export default function UomListPage() {
  return <ListView cfg={CONFIG} />;
}
