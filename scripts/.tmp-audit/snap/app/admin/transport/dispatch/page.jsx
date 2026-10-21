// 'use client';
// import ListView from '@/components/ListView';
// import { FIELDS } from './fields';

// /* Dispatch - list with a New Dispatch dialog. */

// const CONFIG = {
//   title: 'Dispatch',
//   subtitle: 'Manage your dispatch data',
//   basePath: '/admin/transport/',
//   slugPath: 'dispatch',
//   endpoint: '/api/dispatch',
//   scope: ['business', 'location'],
//   addTitle: 'New Dispatch',
//   addLabel: 'New Dispatch',
//   formMode: 'modal',
//   actionIcons: ['edit', 'delete'],
//   columns: [
//     { k: 'docNo', t: 'Doc No' },
//     { k: 'date', t: 'Date', f: 'date' },
//     { k: 'party', t: 'Party' },
//     { k: 'amount', t: 'Amount', f: 'amount' },
//     { k: 'status', t: 'Status', f: 'badges',
//       tone: (v) => (v === 'Delivered' ? 'green' : v === 'Cancelled' ? 'red' : 'blue') },
//   ],
//   fields: FIELDS,
// };

// export default function DispatchListPage() {
//   return <ListView cfg={CONFIG} />;
// }




'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Dispatch - a vehicle leaving with a driver, carrying LR consignments.

   Doc No and the money columns are filled in by the server from the selected
   consignments, so they appear on the list but not on the form. */

const CONFIG = {
  title: 'Dispatch',
  basePath: '/admin/transport/',
  slugPath: 'dispatch',
  endpoint: '/api/dispatch',
  scope: ['business', 'location'],
  addTitle: 'New Dispatch',
  addLabel: 'New Dispatch',
  formMode: 'modal',
  modalWide: true,
  actionIcons: ['edit', 'delete'],
  columns: [
    { k: 'docNo', t: 'Doc No' },
    { k: 'date', t: 'Date', f: 'date' },
    { k: 'vehicleId', t: 'Vehicle', f: 'ref' },
    { k: 'driverId', t: 'Driver', f: 'ref' },
    { k: 'routeId', t: 'Route', f: 'ref' },
    { k: 'deliveryIds', t: 'LRs', f: 'count' },
    { k: 'parcelTotal', t: 'Parcels' },
    { k: 'amount', t: 'Amount', f: 'amount' },
    {
      k: 'status', t: 'Status', f: 'badges',
      tone: (v) => (v === 'Delivered' ? 'green' : v === 'Cancelled' ? 'red' : 'blue'),
    },
  ],
  fields: FIELDS,
};

export default function DispatchListPage() {
  return <ListView cfg={CONFIG} />;
}