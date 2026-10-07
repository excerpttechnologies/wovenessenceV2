'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Sales Term Master */

export default function AddSalesmastertermPage() {
  return (
    <FormView
      cfg={{
        title: "All Sales Term Master",
        addTitle: "Add Sales Term Master",
        basePath: '/admin/setting/',
        slugPath: "sales/master/term",
        endpoint: '/api/sales-term',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
