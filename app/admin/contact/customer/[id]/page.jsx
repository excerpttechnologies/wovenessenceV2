'use client';
import { use } from 'react';
import TabbedFormView from '@/components/TabbedFormView';
import { useScope } from '@/components/ScopeContext';
import { TABS, isCustomerLoyaltyFieldReadOnly, onCustomerOptionChange } from '../tabs';

/* Edit Customers - four tabs, one Submit per tab. */

export default function EditCustomerPage({ params }) {
  const { id } = use(params);
  const { can } = useScope();
  const canEditLoyalty = can ? can('/admin/contact/customer', 'update') : true;

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
        onOptionChange: onCustomerOptionChange,
        isFieldReadOnly: (f) => isCustomerLoyaltyFieldReadOnly(f, canEditLoyalty),
      }}
    />
  );
}
