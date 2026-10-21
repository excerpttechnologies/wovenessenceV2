'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Purchase Group */

export default function AddPurchasegroupPage() {
  return (
    <FormView
      cfg={{
        title: "Purchase Groups",
        addTitle: "Add Purchase Group",
        basePath: '/admin/setting/',
        slugPath: "purchasegroup",
        endpoint: '/api/purchase-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
