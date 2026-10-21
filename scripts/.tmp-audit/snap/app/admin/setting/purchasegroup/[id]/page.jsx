'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Purchase Groups */

export default function EditPurchasegroupPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Purchase Groups",
        addTitle: "Edit Purchase Groups",
        basePath: '/admin/setting/',
        slugPath: "purchasegroup",
        endpoint: '/api/purchase-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
