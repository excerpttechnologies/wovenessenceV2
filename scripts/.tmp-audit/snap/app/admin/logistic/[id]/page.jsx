'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Logistics - the ADD flow is a dialog on the list page, but the
   row action still routes here. */

export default function EditLogisticPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Logistics",
        addTitle: "Edit Logistics",
        basePath: '/admin/',
        slugPath: "logistic",
        endpoint: '/api/logistic',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
