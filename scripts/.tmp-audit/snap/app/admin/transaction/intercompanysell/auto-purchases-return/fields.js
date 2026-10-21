/* Inter Company Auto Purchase Return - field spec.

   The grid, the line maths and the totals are identical to the Inter Company
   Delivery Challan, so they are imported rather than restated: one set of
   rules, one place to change them. Only the header differs - this document
   carries a Supplier and its own date label.

   Plain module (no 'use client'), so the API route imports the same spec. */

export {
  GRID_COLS, BLANK_ROW, computeLine, computeTotals, num, r2, money,
} from '../deliverychallan/fields';

export const FIELDS = [
  { k: 'toBusinessId', label: 'Business', type: 'ref', ref: 'business', req: true },
  { k: 'toLocationId', label: 'Location Name', type: 'ref', ref: 'companylocations', req: true },
  { k: 'supplierId', label: 'Supplier', type: 'ref', ref: 'supplier', req: true, placeholder: 'Select Supplier' },

  { k: 'customerWaybill', label: 'Customer Waybill', type: 'file', info: true },
  { k: 'salesPersonId', label: 'Sales Person', type: 'ref', ref: 'agent', placeholder: 'Select...' },
  {
    k: 'salesTerm', label: 'Sales Term', type: 'select', placeholder: '--Select--',
    opts: [{ v: 'After Tax', l: 'After Tax' }, { v: 'Before Tax', l: 'Before Tax' }],
  },
  { k: 'agentId', label: 'Agent', type: 'ref', ref: 'agent', placeholder: 'Select...' },

  { k: 'stockPointId', label: 'Stock Point', type: 'ref', ref: 'stockpoint', req: true, placeholder: 'Select...' },
  { k: 'logisticId', label: 'Logistics Details', type: 'ref', ref: 'logistic', placeholder: 'Select...' },
  { k: 'returnDate', label: 'Auto Purchase Return Date', type: 'date', req: true, def: 'today' },
];

/* This screen carries no Info box on the deployed app - the three notes on
   the Delivery Challan are about outbound stock, which does not apply to a
   return. */
export const SHOW_INFO = false;
