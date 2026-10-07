'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Product Groups - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Product Groups",
  basePath: '/admin/inventory/',
  slugPath: "product/group",
  endpoint: '/api/product-group',
  scope: ["business"],
  addTitle: "Add Product Group",
  formMode: "modal",
  actionIcons: ["view"],
  aboveCardButton: "Hierarchy View",
  columns: [
    { k: "name", t: "Name" },
    { k: "businessId", t: "Business", f: "ref" },
    { k: "prefix", t: "Prefix" },
    { k: "parentId", t: "Parent", f: "ref" },
  ],
  fields: FIELDS,
};

export default function ProductgroupListPage() {
  return <ListView cfg={CONFIG} />;
}
