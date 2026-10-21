'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Product Groups - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditProductgroupPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Product Groups",
        addTitle: "Edit Product Groups",
        basePath: '/admin/inventory/',
        slugPath: "product/group",
        endpoint: '/api/product-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
