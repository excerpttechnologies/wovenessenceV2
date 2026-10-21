'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Tax Master */

export default function AddTaxPage() {
  return (
    <FormView
      cfg={{
        title: "All Tax",
        addTitle: "Add Tax Master",
        basePath: '/admin/setting/',
        slugPath: "tax",
        endpoint: '/api/tax',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
