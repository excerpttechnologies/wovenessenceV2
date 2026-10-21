'use client';
import FormView from '@/components/FormView';
import { FIELDS, NOTE } from '../fields';

/* Add Split Barcode Settings */

export default function AddSplitbarcodesettingPage() {
  return (
    <FormView
      cfg={{
        title: "Split Barcode Settings",
        addTitle: "Add Split Barcode Settings",
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
