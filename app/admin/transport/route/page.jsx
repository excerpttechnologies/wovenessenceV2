'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Route Master - list with a New Route Master dialog. */

const CONFIG = {
  title: 'Route Master',
  subtitle: 'Manage your route master data',
  basePath: '/admin/transport/',
  slugPath: 'route',
  endpoint: '/api/transport-route',
  scope: ['business', 'location'],
  addTitle: 'New Route Master',
  addLabel: 'New Route Master',
  formMode: 'modal',
  actionIcons: ['edit', 'delete'],
  columns: [
    { k: 'name', t: 'Name' },
    { k: 'code', t: 'Code' },
    { k: 'status', t: 'Status', f: 'yesno' },
    { k: 'status', t: 'Active', f: 'badges', tone: (v) => (v ? 'green' : 'grey'),
      value: (r) => (r.status ? 'Active' : 'Inactive') },
  ],
  fields: FIELDS,
};

export default function RouteListPage() {
  return <ListView cfg={CONFIG} />;
}
