'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Contact Types - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditContacttypePage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Contact Types",
        addTitle: "Edit Contact Types",
        basePath: '/admin/contact/',
        slugPath: "contact-type",
        endpoint: '/api/contact-type',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
