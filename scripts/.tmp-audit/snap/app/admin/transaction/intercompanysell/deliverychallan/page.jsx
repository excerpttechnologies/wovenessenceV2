'use client';
import ListView from '@/components/ListView';

/* Inter Company Delivery Challans - list.
   Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: 'Inter Company Delivery Challans',
  basePath: '/admin/transaction/intercompanysell/',
  slugPath: 'deliverychallan',
  endpoint: '/api/ic-delivery-challan',
  scope: ['business', 'location', 'finYear'],
  addTitle: 'Inter Company Delivery Challan',
  /* view + edit + print, matching the deployed row actions */
  actionIcons: ['view', 'edit', 'print'],
  filters: [
    { k: 'toBusinessId', label: 'To Business', type: 'ref', ref: 'business', placeholder: 'Select Business' },
    { k: 'startDate', label: 'Start Date', type: 'date' },
    { k: 'endDate', label: 'End Date', type: 'date' },
  ],
  columns: [
    { k: 'toBusinessId', t: 'Customer Name', f: 'ref' },
    { k: 'dcNo', t: 'DC No' },
    { k: 'dcDate', t: 'DC Date', f: 'date' },
    { k: 'toLocationId', t: 'To Location', f: 'ref' },
    { k: 'stockPointId', t: 'Stock Point', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
    { k: 'createdAt', t: 'Creadted On', f: 'date' },
    { k: 'netValue', t: 'Total Value', f: 'amount' },
  ],
};

export default function IcDeliveryChallanListPage() {
  return <ListView cfg={CONFIG} />;
}
