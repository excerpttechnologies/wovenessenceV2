'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS, NOTE } from '../fields';

/* Edit Doc Setups */

export default function EditDocsetupPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Doc Setups",
        addTitle: "Edit Doc Setups",
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
