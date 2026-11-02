'use client';
import FormView from '@/components/FormView';
import { FIELDS } from '../fields';

/* Accounts > Chart of Accounts - add */

export default function AddAccountPage() {
  return (
    <FormView
      cfg={{
        title: 'Chart of Accounts',
        addTitle: 'Add Account',
        basePath: '/admin/accounting/',
        slugPath: 'chart-of-accounts',
        endpoint: '/api/accounting/accounts',
        scope: ['business', 'location'],
        fields: FIELDS,
        note: [
          'Opening Balance follows the accounting sign: a positive figure is a debit (Dr) balance, a negative one is a credit (Cr) balance.',
          'Leave the code blank to take the next free number. It may not repeat within this business.',
        ],
      }}
    />
  );
}
