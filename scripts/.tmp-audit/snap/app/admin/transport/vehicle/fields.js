/* Vehicle Master fields - name / code / status, the shape the three transport
   masters share. */

export const FIELDS = [
  { k: 'name', label: 'Name', type: 'text', req: true, span: 'all' },
  { k: 'code', label: 'Code', type: 'text', span: 'all' },
  { k: 'status', label: 'Status', type: 'checkbox', def: true, span: 'all' },
];
