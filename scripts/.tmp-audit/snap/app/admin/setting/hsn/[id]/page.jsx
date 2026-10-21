'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS, ROWS_TABLE } from '../fields';

/* Edit HSN Codes */

export default function EditHsnPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "HSN Codes",
        addTitle: "Edit HSN Codes",
        basePath: '/admin/setting/',
        slugPath: "hsn",
        endpoint: '/api/hsn',
        scope: ["business"],
        fields: FIELDS,
        rowsTable: ROWS_TABLE,
      }}
    />
  );
}
