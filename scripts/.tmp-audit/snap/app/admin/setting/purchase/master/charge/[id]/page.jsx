'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit All Purchase Charge Master */

export default function EditPurchasemasterchargePage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "All Purchase Charge Master",
        addTitle: "Edit All Purchase Charge Master",
        basePath: '/admin/setting/',
        slugPath: "purchase/master/charge",
        endpoint: '/api/purchase-charge',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
