'use client';
import TabbedFormView from '@/components/TabbedFormView';
import { TABS } from '../tabs';

/* Add Agents - four tabs, one Submit per tab. */

export default function AddAgentPage() {

  return (
    <TabbedFormView
      cfg={{
        title: "Agents",
        addTitle: "Add Agents",
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
