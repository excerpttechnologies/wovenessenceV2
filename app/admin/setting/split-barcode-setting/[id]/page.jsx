'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS, NOTE } from '../fields';

/* Edit Split Barcode Settings */

export default function EditSplitbarcodesettingPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Split Barcode Settings",
        addTitle: "Edit Split Barcode Settings",
        basePath: '/admin/setting/',
        slugPath: "split-barcode-setting",
        endpoint: '/api/split-barcode-setting',
        scope: ["business","finYear"],
        fields: FIELDS,
        note: NOTE,
      }}
    />
  );
}
