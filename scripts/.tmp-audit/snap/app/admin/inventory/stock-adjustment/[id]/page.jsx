'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Stock Adjustments */

export default function EditStockadjustmentPage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Stock Adjustments",
        addTitle: "Edit Stock Adjustments",
        basePath: '/admin/inventory/',
        slugPath: "stock-adjustment",
        endpoint: '/api/stock-adjustment',
        scope: ["business","location","finYear"],
        docType: "Stock Adjustment",
        form: FORM,
      }}
    />
  );
}
