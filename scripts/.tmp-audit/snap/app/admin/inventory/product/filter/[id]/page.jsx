'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Product Filters - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditProductfilterPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Product Filters",
        addTitle: "Edit Product Filters",
        basePath: '/admin/inventory/',
        slugPath: "product/filter",
        endpoint: '/api/product-filter',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
