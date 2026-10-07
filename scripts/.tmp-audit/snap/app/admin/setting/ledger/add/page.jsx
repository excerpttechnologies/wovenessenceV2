'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Ledger */

export default function AddLedgerPage() {
  return (
    <FormView
      cfg={{
        title: "Ledgers",
        addTitle: "Add Ledger",
        basePath: '/admin/setting/',
        slugPath: "ledger",
        endpoint: '/api/ledger',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
