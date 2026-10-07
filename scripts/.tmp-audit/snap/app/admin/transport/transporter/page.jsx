'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Transport Master - transporter settings and freight configuration. */

const CONFIG = {
  title: 'Transporter Master',
  basePath: '/admin/transport/',
  slugPath: 'transporter',
  endpoint: '/api/transporter',
  scope: ['business', 'location'],
  addTitle: 'Add Transporter',
  formMode: 'modal',
  modalWide: true,
  actionIcons: ['edit', 'delete'],
  columns: [
    { k: 'transporterName', t: 'Transporter Name' },
    { k: 'freight', t: 'Freight Mode', f: 'badges', tone: () => 'blue' },
    { k: 'gstApplicable', t: 'GST', f: 'badges', tone: (v) => (v === 'Yes' ? 'green' : 'red') },
    { k: 'autoChargesMode', t: 'Auto Charges', f: 'list' },
    { k: 'tipsMode', t: 'Tips', f: 'list' },
  ],
  fields: FIELDS,
};

export default function TransporterListPage() {
  return <ListView cfg={CONFIG} />;
}
