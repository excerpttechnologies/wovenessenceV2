'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add New Business */

export default function AddBusinessPage() {
  return (
    <FormView
      cfg={{
        title: "Business",
        addTitle: "Add New Business",
        basePath: '/admin/setting/',
        slugPath: "business",
        endpoint: '/api/business',
        scope: [],
        fields: FIELDS,
      }}
    />
  );
}
