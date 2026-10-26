'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add POS Footer Template (26-10-2026) */

export default function AddPosFooterPage() {
  return (
    <FormView
      cfg={{
        title: "POS Footer Templates",
        addTitle: "Add POS Footer Template",
        basePath: '/admin/setting/',
        slugPath: "pos-footer",
        endpoint: '/api/pos-footer-template',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
