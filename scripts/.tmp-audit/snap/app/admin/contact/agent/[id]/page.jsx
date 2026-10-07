'use client';
import { use } from 'react';
import TabbedFormView from '@/components/TabbedFormView';
import { TABS } from '../tabs';

/* Edit Agents - four tabs, one Submit per tab. */

export default function EditAgentPage({ params }) {
  const { id } = use(params);

  return (
    <TabbedFormView
      id={id}
      cfg={{
        title: "Agents",
        addTitle: "Edit Agents",
        basePath: '/admin/contact/',
        slugPath: "agent",
        endpoint: '/api/agent',
        scope: ["business"],
        contactKind: "Agent",
        tabs: TABS,
      }}
    />
  );
}
