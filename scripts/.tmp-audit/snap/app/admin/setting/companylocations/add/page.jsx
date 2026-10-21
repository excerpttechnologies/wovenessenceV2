'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add Company Location */

export default function AddCompanylocationsPage() {
  return (
    <FormView
      cfg={{
        title: "Company Locations",
        addTitle: "Add Company Location",
        basePath: '/admin/setting/',
        slugPath: "companylocations",
        endpoint: '/api/company-location',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
