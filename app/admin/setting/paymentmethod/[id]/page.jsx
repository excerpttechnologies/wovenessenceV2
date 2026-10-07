'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Payment Methods */

export default function EditPaymentmethodPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Payment Methods",
        addTitle: "Edit Payment Methods",
        basePath: '/admin/setting/',
        slugPath: "paymentmethod",
        endpoint: '/api/payment-method',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
