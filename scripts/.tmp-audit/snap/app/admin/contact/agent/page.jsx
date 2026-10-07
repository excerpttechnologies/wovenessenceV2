'use client';
import ListView from '@/components/ListView';
import { TABS } from './tabs';

/* Agents - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Agents",
  basePath: '/admin/contact/',
  slugPath: "agent",
  endpoint: '/api/agent',
  scope: ["business"],
  formMode: "tabs",
  columns: [
    /* The Agent form does not ask for Business Name (the deployed one does not
       either), so fall back to the person's name - otherwise every agent added
       from this form shows a blank Name cell. */
    {
      k: "businessName",
      t: "Name",
      value: (r) =>
        String(r.businessName || '').trim() ||
        [r.firstName, r.lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
    },
    { k: "contactId", t: "Contact ID" },
    { k: "billingMobile", t: "Mobile" },
    { k: "billingEmail", t: "Email" },
    { k: "billingAddressLine1", t: "Address" },
  ],
};

export default function AgentListPage() {
  return <ListView cfg={CONFIG} />;
}
