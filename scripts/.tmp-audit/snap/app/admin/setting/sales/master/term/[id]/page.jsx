'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit All Sales Term Master */

export default function EditSalesmastertermPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "All Sales Term Master",
        addTitle: "Edit All Sales Term Master",
        basePath: '/admin/setting/',
        slugPath: "sales/master/term",
        endpoint: '/api/sales-term',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
