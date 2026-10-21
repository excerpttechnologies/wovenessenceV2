'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Product Filters - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Product Filters",
  basePath: '/admin/inventory/',
  slugPath: "product/filter",
  endpoint: '/api/product-filter',
  scope: ["business"],
  addTitle: "Add Product Filter",
  formMode: "modal",
  columns: [
    { k: "name", t: "Name" },
    { k: "description", t: "Description" },
    { k: "parentId", t: "Parent", f: "ref" },
  ],
  fields: FIELDS,
};

export default function ProductfilterListPage() {
  return <ListView cfg={CONFIG} />;
}
