'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Purchase Charge Master */

export default function AddPurchasemasterchargePage() {
  return (
    <FormView
      cfg={{
        title: "All Purchase Charge Master",
        addTitle: "Add Purchase Charge Master",
        basePath: '/admin/setting/',
        slugPath: "purchase/master/charge",
        endpoint: '/api/purchase-charge',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
