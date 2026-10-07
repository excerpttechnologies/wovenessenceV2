'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Unit of Measurements - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditUomPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Unit of Measurements",
        addTitle: "Edit Unit of Measurements",
        basePath: '/admin/inventory/',
        slugPath: "uom",
        endpoint: '/api/uom',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
