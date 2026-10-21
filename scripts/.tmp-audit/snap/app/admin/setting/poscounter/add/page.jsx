'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Pos Counter */

export default function AddPoscounterPage() {
  return (
    <FormView
      cfg={{
        title: "Cash Counters",
        addTitle: "Add Cash Counter",
        basePath: '/admin/setting/',
        slugPath: "poscounter",
        endpoint: '/api/pos-counter',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
