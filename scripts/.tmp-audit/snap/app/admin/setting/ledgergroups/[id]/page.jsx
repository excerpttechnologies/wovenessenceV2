'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Ledger Groups */

export default function EditLedgergroupsPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Ledger Groups",
        addTitle: "Edit Ledger Groups",
        basePath: '/admin/setting/',
        slugPath: "ledgergroups",
        endpoint: '/api/ledger-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
