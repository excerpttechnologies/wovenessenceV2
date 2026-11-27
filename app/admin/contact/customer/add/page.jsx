'use client';
import TabbedFormView from '@/components/TabbedFormView';
import { useScope } from '@/components/ScopeContext';
import { TABS, isCustomerLoyaltyFieldReadOnly, onCustomerOptionChange } from '../tabs';

/* Add Customers - the three tabs walked in order: Next, Next, Submit. The
   tab strip and every field under it are unchanged; `wizard` only swaps the
   per-tab Submit for the Back / Next footer, so the customer is created once,
   by the Submit on the last tab. */

export default function AddCustomerPage() {
  const { can } = useScope();
  const canEditLoyalty = can ? can('/admin/contact/customer', 'create') : true;

  return (
    <TabbedFormView
      cfg={{
        title: "Customers",
        addTitle: "Add Customers",
        basePath: '/admin/contact/',
        slugPath: "customer",
        endpoint: '/api/customer',
        scope: ["business"],
        contactKind: "Customer",
        tabs: TABS,
        wizard: true,
        onOptionChange: onCustomerOptionChange,
        isFieldReadOnly: (f) => isCustomerLoyaltyFieldReadOnly(f, canEditLoyalty),
      }}
    />
  );
}
