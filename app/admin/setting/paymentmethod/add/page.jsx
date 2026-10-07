'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Payment Method */

export default function AddPaymentmethodPage() {
  return (
    <FormView
      cfg={{
        title: "Payment Methods",
        addTitle: "Add Payment Method",
        basePath: '/admin/setting/',
        slugPath: "paymentmethod",
        endpoint: '/api/payment-method',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
