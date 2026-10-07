'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Items */

export default function EditItemPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Items",
        addTitle: "Edit Items",
        basePath: '/admin/inventory/',
        slugPath: "item",
        endpoint: '/api/item',
        scope: ["business"],
        fields: FIELDS,
        extraFormButton: "Add Varient",
      }}
    />
  );
}
