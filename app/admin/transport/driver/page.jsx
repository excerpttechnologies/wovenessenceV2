'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Driver Master - list with a New Driver Master dialog. */

const CONFIG = {
  title: 'Driver Master',
  subtitle: 'Manage your driver master data',
  basePath: '/admin/transport/',
  slugPath: 'driver',
  endpoint: '/api/driver',
  scope: ['business', 'location'],
  addTitle: 'New Driver Master',
  addLabel: 'New Driver Master',
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

export default function DriverListPage() {
  return <ListView cfg={CONFIG} />;
}
