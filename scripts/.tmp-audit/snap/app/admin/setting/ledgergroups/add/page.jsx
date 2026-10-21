'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Ledger Group */

export default function AddLedgergroupsPage() {
  return (
    <FormView
      cfg={{
        title: "Ledger Groups",
        addTitle: "Add Ledger Group",
        basePath: '/admin/setting/',
        slugPath: "ledgergroups",
        endpoint: '/api/ledger-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
