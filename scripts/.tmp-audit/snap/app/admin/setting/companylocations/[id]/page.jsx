'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Edit Company Locations */

export default function EditCompanylocationsPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: "Company Locations",
        addTitle: "Edit Company Locations",
        basePath: '/admin/setting/',
        slugPath: "companylocations",
        endpoint: '/api/company-location',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
