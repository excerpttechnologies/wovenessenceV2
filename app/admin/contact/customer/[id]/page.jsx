'use client';
import { use } from 'react';
import TabbedFormView from '@/components/TabbedFormView';
import { TABS } from '../tabs';

/* Edit Customers - four tabs, one Submit per tab. */

export default function EditCustomerPage({ params }) {
  const { id } = use(params);

  return (
    <TabbedFormView
      id={id}
      cfg={{
        title: "Customers",
        addTitle: "Edit Customers",
        basePath: '/admin/contact/',
        slugPath: "customer",
        endpoint: '/api/customer',
        scope: ["business"],
        contactKind: "Customer",
        tabs: TABS,
      }}
    />
  );
}
