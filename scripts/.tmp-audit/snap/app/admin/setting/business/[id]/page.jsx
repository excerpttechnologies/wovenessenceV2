'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Business */

export default function EditBusinessPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Business",
        addTitle: "Edit Business",
        basePath: '/admin/setting/',
        slugPath: "business",
        endpoint: '/api/business',
        scope: [],
        fields: FIELDS,
      }}
    />
  );
}
