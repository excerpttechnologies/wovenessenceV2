'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit POS Footer Template (26-10-2026) */

export default function EditPosFooterPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "POS Footer Templates",
        addTitle: "Edit POS Footer Template",
        basePath: '/admin/setting/',
        slugPath: "pos-footer",
        endpoint: '/api/pos-footer-template',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
