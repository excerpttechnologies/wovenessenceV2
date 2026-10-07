'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Ledgers */

export default function EditLedgerPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Ledgers",
        addTitle: "Edit Ledgers",
        basePath: '/admin/setting/',
        slugPath: "ledger",
        endpoint: '/api/ledger',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
