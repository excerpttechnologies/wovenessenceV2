'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Driver Master */

export default function EditDriverPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Driver Master',
        addTitle: 'Edit Driver Master',
        basePath: '/admin/transport/',
        slugPath: 'driver',
        endpoint: '/api/driver',
        scope: ['business', 'location'],
        fields: FIELDS,
      }}
    />
  );
}
