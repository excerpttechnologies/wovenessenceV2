'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit All Tax */

export default function EditTaxPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "All Tax",
        addTitle: "Edit All Tax",
        basePath: '/admin/setting/',
        slugPath: "tax",
        endpoint: '/api/tax',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
