'use client';
import ListView from '@/components/ListView';

/* Items - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Items",
  basePath: '/admin/inventory/',
  slugPath: "item",
  endpoint: '/api/item',
  scope: ["business"],
  addTitle: "Add Item",
  serialNumber: true,  // Enable serial numbers
  columns: [
    { k: "name", t: "Name" },
    { k: "itemType", t: "Item Type" },
    { k: "hsnId", t: "HSN Code", f: "ref" },
    { k: "uomId", t: "UOM", f: "ref" },
    { k: "prefix", t: "Prefix" },
    { k: "itemCode", t: "Item Code" },
    { k: "ecommItemCode", t: "Ecomm Item Code" },
    { k: "groupId", t: "Group", f: "ref" },
    { k: "subGroupId", t: "Sub Group", f: "ref" },
  ],
};

export default function ItemListPage() {
  return <ListView cfg={CONFIG} />;
}
