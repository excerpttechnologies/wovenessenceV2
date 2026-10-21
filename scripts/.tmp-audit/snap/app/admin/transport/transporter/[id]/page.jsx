'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Transporter - reached from the row's edit icon. Add happens in a
   dialog over the list; edit gets its own route so a record is linkable. */

export default function EditTransporterPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Transporter Master',
        addTitle: 'Edit Transporter',
        basePath: '/admin/transport/',
        slugPath: 'transporter',
        endpoint: '/api/transporter',
        scope: ['business', 'location'],
        fields: FIELDS,
      }}
    />
  );
}
