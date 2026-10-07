'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Sales Person */

export default function AddSalespersonPage() {
  return (
    <FormView
      cfg={{
        title: "My Sales Person",
        addTitle: "Add Sales Person",
        basePath: '/admin/staff-management/staff/',
        slugPath: "salesperson",
        endpoint: '/api/sales-person',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
