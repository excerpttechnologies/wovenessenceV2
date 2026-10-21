'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Stockpoint */

export default function AddStockpointPage() {
  return (
    <FormView
      cfg={{
        title: "Stock Points",
        addTitle: "Add Stockpoint",
        basePath: '/admin/setting/',
        slugPath: "stockpoint",
        endpoint: '/api/stock-point',
        scope: ["business","location"],
        fields: FIELDS,
      }}
    />
  );
}
