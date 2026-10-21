'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Route Master */

export default function EditRoutePage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Route Master',
        addTitle: 'Edit Route Master',
        basePath: '/admin/transport/',
        slugPath: 'route',
        endpoint: '/api/transport-route',
        scope: ['business', 'location'],
        fields: FIELDS,
      }}
    />
  );
}
