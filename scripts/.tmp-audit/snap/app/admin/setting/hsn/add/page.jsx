'use client';
import FormView from '@/components/FormView';
import { FIELDS, ROWS_TABLE } from '../fields';

/* Add HSN */

export default function AddHsnPage() {
  return (
    <FormView
      cfg={{
        title: "HSN Codes",
        addTitle: "Add HSN",
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
