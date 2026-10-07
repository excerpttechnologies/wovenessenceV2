'use client';
import ListView from '@/components/ListView';

/* E-commerce -> Products.

   The storefront catalogue: one row per item in the master, with its Stock
   counted from the barcode rows generated against it.

   Read-only: no ADD button. A product is an Item, so it is created at
   Inventory -> Item, and it gets stock at Inventory -> Barcode Generation.

   Built on ListView - the deployed screen is exactly its shape: column
   visibility, search, the three exports, a paginated table and one row
   action. Nothing bespoke was needed. */

const CONFIG = {
  title: 'Ecom Products',
  basePath: '/admin/ecommerce/',
  slugPath: 'product',
  endpoint: '/api/ecom-product',
  scope: ['business', 'location', 'finYear'],

  /* products are generated, not typed */
  showAdd: false,

  /* a product IS an item, so the row action opens its Item record - the row's
     _id is the item's id, so this never points at a page that does not exist */
  actionVariant: 'dropdown',
  actionMenu: [
    {
      label: 'View Item',
      icon: 'eye',
      to: (r) => '/admin/inventory/item/' + r._id,
    },
  ],

  columns: [
    { k: 'name', t: 'Name' },
    { k: 'itemCode', t: 'Item Code' },
    { k: 'hsnCode', t: 'HSN Code' },
    { k: 'group', t: 'Group' },
    { k: 'subGroup', t: 'Sub Group' },
    { k: 'stock', t: 'Stock' },
    { k: 'uom', t: 'UOM' },
  ],
};

export default function EcomProductsPage() {
  return <ListView cfg={CONFIG} />;
}
