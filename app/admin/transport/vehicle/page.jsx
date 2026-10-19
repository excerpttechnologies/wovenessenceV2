'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Vehicle Master - list with a New Vehicle Master dialog. */

const CONFIG = {
  title: 'Vehicle Master',
  subtitle: 'Manage your vehicle master data',
  basePath: '/admin/transport/',
  slugPath: 'vehicle',
  endpoint: '/api/vehicle',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ['business', 'location'],
  addTitle: 'New Vehicle Master',
  addLabel: 'New Vehicle Master',
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

export default function VehicleListPage() {
  return <ListView cfg={CONFIG} />;
}
