'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';
import { FIELDS as HSN_FIELDS } from '@/app/admin/setting/hsn/fields';

/* Add Item */

export default function AddItemPage() {

  return (
    <FormView
      cfg={{
        title: "Items",
        addTitle: "Add Item",
        basePath: '/admin/inventory/',
        slugPath: "item",
        endpoint: '/api/item',
        scope: ["business"],
        fields: FIELDS,
        quickAdds: {
          hsnId: {
            label: 'Add HSN',
            title: 'Add HSN Code',
            slug: 'hsn',
            endpoint: '/api/hsn',
            fields: HSN_FIELDS,
          },
        },
        extraFormButton: "Add Varient",
      }}
    />
  );
}
