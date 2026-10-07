'use client';
import { use } from 'react';
import TabbedFormView from '@/components/TabbedFormView';
import SupplierImportPanel from '@/components/SupplierImportPanel';
import { FIELD_LABELS, TABS } from '../tabs';
import { isGstLockedField } from '../gstAddress';

/* Edit Suppliers - three tabs, one Submit per tab, exactly as Contacts >
   Customers works. The id below is what makes each save a PUT rather than a
   POST, so editing never creates a second supplier. */

export default function EditSupplierPage({ params }) {
  const { id } = use(params);

  return (
    <TabbedFormView
      id={id}
      cfg={{
        title: "Suppliers",
        addTitle: "Edit Suppliers",
        basePath: '/admin/contact/',
        slugPath: "supplier",
        endpoint: '/api/supplier',
        scope: ["business"],
        contactKind: "Supplier",
        tabs: TABS,
        /* GST entered -> the registered billing address is read-only;
           GST cleared -> it is editable again. The rule itself lives in
           ../gstAddress.js so the add and edit pages cannot drift apart. */
        isFieldReadOnly: isGstLockedField,
        /* GST NO is checked against the supplier master when it loses focus,
           when an import fills it and again on Submit. This supplier's own
           number is excluded, so opening it never reports a duplicate. The
           API re-checks on save regardless. See runGstCheck in
           TabbedFormView. */
        gstLookup: true,
        /* GST / Excel import belongs with the identity fields it fills, so
           it is rendered on the Basic Information tab only. applyPatch writes
           into the form's shared state - nothing reaches the API until the
           operator hits Submit. */
        renderStepExtras: ({ tab, data, applyPatch }) => (
          tab.key === 'basic'
            ? <SupplierImportPanel data={data} labels={FIELD_LABELS} onApply={applyPatch} />
            : null
        ),
      }}
    />
  );
}
