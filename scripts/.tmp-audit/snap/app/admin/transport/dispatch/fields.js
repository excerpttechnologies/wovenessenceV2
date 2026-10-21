// /* Dispatch fields. */

// export const STATUS_OPTS = [
//   { v: 'Pending', l: 'Pending' },
//   { v: 'Dispatched', l: 'Dispatched' },
//   { v: 'Delivered', l: 'Delivered' },
//   { v: 'Cancelled', l: 'Cancelled' },
// ];

// export const FIELDS = [
//   { k: 'docNo', label: 'Doc No', type: 'text', req: true, span: 'all' },
//   { k: 'date', label: 'Date', type: 'date', span: 'all' },
//   { k: 'party', label: 'Party', type: 'text', span: 'all' },
//   { k: 'amount', label: 'Amount', type: 'number', span: 'all' },
//   { k: 'status', label: 'Status', type: 'select', def: 'Pending', placeholder: 'Select...', opts: STATUS_OPTS, span: 'all' },
// ];





/* Dispatch fields.

   Two field sets on purpose:

   FIELDS      - creating a dispatch, where the consignments are chosen.
   EDIT_FIELDS - editing one, where they are not. Which deliveries a dispatch
                 carries is fixed when it is raised; releasing and re-claiming
                 consignments mid-edit is how documents end up double-assigned.
                 To change the load, delete the dispatch (which releases every
                 consignment) and raise it again. */

export const STATUS_OPTS = [
  { v: 'Pending', l: 'Pending' },
  { v: 'Dispatched', l: 'Dispatched' },
  { v: 'Delivered', l: 'Delivered' },
  { v: 'Cancelled', l: 'Cancelled' },
];

const COMMON = [
  { k: 'date', label: 'Date', type: 'date', req: true, span: 'all' },
  { k: 'vehicleId', label: 'Vehicle', type: 'ref', ref: 'vehicle', req: true, placeholder: 'Select vehicle', span: 'all' },
  { k: 'driverId', label: 'Driver', type: 'ref', ref: 'driver', req: true, placeholder: 'Select driver', span: 'all' },
  { k: 'routeId', label: 'Route', type: 'ref', ref: 'transport-route', placeholder: 'Select route', span: 'all' },
  { k: 'party', label: 'Party', type: 'text', span: 'all' },
  { k: 'status', label: 'Status', type: 'select', def: 'Pending', placeholder: 'Select...', opts: STATUS_OPTS, span: 'all' },
];

export const FIELDS = [
  ...COMMON.slice(0, 4),
  {
    k: 'deliveryIds', label: 'Consignments', type: 'multiref',
    /* only deliveries no dispatch has claimed yet */
    ref: 'delivery-unassigned', req: true,
    placeholder: 'Select LR transactions', span: 'all',
  },
  ...COMMON.slice(4),
];

export const EDIT_FIELDS = COMMON;