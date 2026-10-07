'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Sales Person */

export default function EditSalespersonPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "My Sales Person",
        addTitle: "Edit Sales Person",
        basePath: '/admin/staff-management/staff/',
        slugPath: "salesperson",
        endpoint: '/api/sales-person',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
