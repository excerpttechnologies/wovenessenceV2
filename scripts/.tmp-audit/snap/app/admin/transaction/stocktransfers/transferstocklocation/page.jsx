'use client';
import ListView from '@/components/ListView';

/* Transfer Stock Locations - list.
   Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: 'Transfer Stock Locations',
  basePath: '/admin/transaction/stocktransfers/',
  slugPath: 'transferstocklocation',
  endpoint: '/api/stock-transfer-location',
  scope: ['business', 'location', 'finYear'],
  addTitle: 'Add Transfer Stock Location',
  /* view opens the read-only record, which carries its own Print button */
  actionIcons: ['view', 'delete'],
  filters: [
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'packetNo', t: 'Packet No' },
    { k: 'fromLocationId', t: 'Transfer From', f: 'ref' },
    { k: 'toLocationId', t: 'Transfer To', f: 'ref' },
    { k: 'stlDate', t: 'Transfer Date', f: 'date' },
  ],
};

export default function StockTransferLocationListPage() {
  return <ListView cfg={CONFIG} />;
}
