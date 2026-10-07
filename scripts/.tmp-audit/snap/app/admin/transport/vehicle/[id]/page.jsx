'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Vehicle Master */

export default function EditVehiclePage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Vehicle Master',
        addTitle: 'Edit Vehicle Master',
        basePath: '/admin/transport/',
        slugPath: 'vehicle',
        endpoint: '/api/vehicle',
        scope: ['business', 'location'],
        fields: FIELDS,
      }}
    />
  );
}
