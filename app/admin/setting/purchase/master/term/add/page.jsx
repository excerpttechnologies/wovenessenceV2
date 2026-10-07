'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Purchase Term Master */

export default function AddPurchasemastertermPage() {
  return (
    <FormView
      cfg={{
        title: "All Purchase Term Masters",
        addTitle: "Add Purchase Term Master",
        basePath: '/admin/setting/',
        slugPath: "purchase/master/term",
        endpoint: '/api/purchase-term',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
