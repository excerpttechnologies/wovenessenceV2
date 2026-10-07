'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Stock Points */

export default function EditStockpointPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Stock Points",
        addTitle: "Edit Stock Points",
        basePath: '/admin/setting/',
        slugPath: "stockpoint",
        endpoint: '/api/stock-point',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
