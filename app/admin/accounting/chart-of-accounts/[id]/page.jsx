'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Accounts > Chart of Accounts - edit */

export default function EditAccountPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Chart of Accounts',
        addTitle: 'Edit Account',
        basePath: '/admin/accounting/',
        slugPath: 'chart-of-accounts',
        endpoint: '/api/accounting/accounts',
        scope: ['business', 'location'],
        fields: FIELDS,
        note: [
          'An account that already has postings cannot move business or location - that would detach its history. Mark it inactive instead of deleting it.',
        ],
      }}
    />
  );
}
