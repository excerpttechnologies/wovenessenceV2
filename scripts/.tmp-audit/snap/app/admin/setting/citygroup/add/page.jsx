'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Add City Group */

export default function AddCitygroupPage() {
  return (
    <FormView
      cfg={{
        title: "City Groups",
        addTitle: "Add City Group",
        basePath: '/admin/setting/',
        slugPath: "citygroup",
        endpoint: '/api/city-group',
        scope: ["business"],
        fields: FIELDS,
      }}
    />
  );
}
