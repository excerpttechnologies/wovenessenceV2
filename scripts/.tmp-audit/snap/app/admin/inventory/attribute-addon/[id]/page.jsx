'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Attribute Addons - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditAttributeaddonPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Attribute Addons",
        addTitle: "Edit Attribute Addons",
        basePath: '/admin/inventory/',
        slugPath: "attribute-addon",
        endpoint: '/api/attribute-addon',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
