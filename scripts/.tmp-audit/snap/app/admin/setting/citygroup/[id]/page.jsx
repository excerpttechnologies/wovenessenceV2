'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit City Groups */

export default function EditCitygroupPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "City Groups",
        addTitle: "Edit City Groups",
        basePath: '/admin/setting/',
        slugPath: "citygroup",
        endpoint: '/api/city-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
