'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit All Purchase Term Masters */

export default function EditPurchasemastertermPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "All Purchase Term Masters",
        addTitle: "Edit All Purchase Term Masters",
        basePath: '/admin/setting/',
        slugPath: "purchase/master/term",
        endpoint: '/api/purchase-term',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
