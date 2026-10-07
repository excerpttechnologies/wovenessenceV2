'use client';
import FormView from '@/components/FormView';
import { FIELDS, NOTE } from '../fields';

/* Add Doc Setup */

export default function AddDocsetupPage() {
  return (
    <FormView
      cfg={{
        title: "Doc Setups",
        addTitle: "Add Doc Setup",
        basePath: '/admin/setting/',
        slugPath: "docsetup",
        endpoint: '/api/doc-setup',
        scope: ["business","finYear"],
        fields: FIELDS,
        note: NOTE,
      }}
    />
  );
}
