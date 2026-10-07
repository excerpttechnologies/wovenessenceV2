'use client';
import TabbedFormView from '@/components/TabbedFormView';
import SupplierImportPanel from '@/components/SupplierImportPanel';
import { AGENT_QUICK_FIELDS, FIELD_LABELS, TABS } from '../tabs';
import { isGstLockedField } from '../gstAddress';

/* Add Suppliers - the three tabs walked in order: Next, Next, Submit. The
   tab strip and everything under it are unchanged; `wizard` only swaps the
   per-tab Submit for the Back / Next footer, so the record is written once,
   by the Submit on the last tab, and abandoning the form half way leaves no
   partial supplier behind. */

export default function AddSupplierPage() {

  return (
    <TabbedFormView
      cfg={{
        title: "Suppliers",
        addTitle: "Add Suppliers",
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
           when an import fills it and again on Submit; a number another
           supplier holds cannot be saved. The API re-checks on save
           regardless. See runGstCheck in TabbedFormView. */
        gstLookup: true,
        wizard: true,
        /* GST / Excel import belongs with the identity fields it fills, so
           it is rendered on the Basic Information tab only. applyPatch writes
           into the form's shared state - nothing reaches the API until the
           operator hits Submit. */
        renderStepExtras: ({ tab, data, applyPatch }) => (
          tab.key === 'basic'
            ? <SupplierImportPanel data={data} labels={FIELD_LABELS} onApply={applyPatch} />
            : null
        ),
        quickAdds: {
          agentId: {
            label: 'Add Agent', title: 'Add Agent', slug: 'agent', ref: 'agent',
            endpoint: '/api/agent', fields: AGENT_QUICK_FIELDS,
            prepareData: (data) => ({ ...data, openingBalance: 0 }),
          },
        },
      }}
    />
  );
}
