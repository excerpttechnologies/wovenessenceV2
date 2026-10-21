/* Doc Setup rules: the sample preview and the validation.

   Pure - no database, no Next, no session. The API route imports these, and
   so can a test, which is the point: the route itself pulls in next/headers
   through lib/session and cannot be loaded outside a Next runtime, so
   anything worth testing has to live away from it.

   Same arrangement as lib/challan.js and lib/sourceLabel.js. */

/* How often a running number restarts at Start From. */
export const VALIDITIES = ['Never', 'Daily', 'Monthly', 'Yearly'];

/* The document types that can be configured.

   Every one of these is a type some route actually passes to
   nextDocNumber(), and every type a route passes appears here - checked by
   scripts/testDocSetup.mjs, because a type the code uses but the form does
   not offer cannot be configured at all. That was the state of "POS" and
   "POS Return": the till allocated numbers through a Doc Setup that could
   never be created, so POS invoices came out as bare 0001. */
export const DOCUMENT_TYPES = [
  'Goods Receipt Challan',
  'Purchase Invoice',
  'Purchase Debit Note',
  'GRT',
  'Debit Note',
  'Delivery Challan',
  'Sales Invoice',
  'Sales Return',
  'Credit Note',
  'POS',
  'POS Return',
  'Stock Transfer Packet',
  'Stock Transfer Received',
  'Stock Transfer Location',
  'Stock Adjustment',
  'Item Split',
  'Inter Company Sales Invoice',
  'Inter Company Sales Return',
  'Inter Company Delivery Challan',
  'Inter Company Auto Purchase Received',
  'Inter Company Auto Purchase Return',
];

/* The preview, built the way the numbering service builds a real number:

     sample = prefix + zeroPad(startFrom, autoNumberLength) + suffix

   Placeholder tokens are deliberately LEFT UNRESOLVED. The preview shows the
   template - [YY] only becomes a year when a document is actually issued -
   which is what the reference system displays too.

   This is computed on every save. It used to be a required free-text box, so
   the stored preview was whatever somebody typed: one live row has a prefix
   of "htfdvbg" and a sample of "grcccr", which describes no number the system
   would ever produce. */
export function buildSample(d) {
  const pad = Math.max(1, Number(d?.autoNumberLength) || 4);
  const start = Number(d?.startFrom) || 0;
  return String(d?.prefix || '') + String(start).padStart(pad, '0') + String(d?.suffix || '');
}

/* Returns an errors object, or null when the config is sound. */
export function validateSetup(d) {
  const e = {};

  if (!String(d?.documentType || '').trim()) e.documentType = 'Choose a document type';
  else if (!DOCUMENT_TYPES.includes(d.documentType)) {
    e.documentType = `"${d.documentType}" is not a document type this system issues numbers for`;
  }

  const len = Number(d?.autoNumberLength);
  if (!Number.isInteger(len) || len < 1 || len > 16) {
    e.autoNumberLength = 'Auto Number Length must be a whole number between 1 and 16';
  }

  const start = Number(d?.startFrom);
  if (!Number.isInteger(start) || start < 0) {
    e.startFrom = 'Start From must be a whole number of 0 or more';
  }

  if (d?.validity && !VALIDITIES.includes(d.validity)) {
    e.validity = 'Validity must be ' + VALIDITIES.join(', ');
  }

  /* A document number has to fit the box it prints into. The form's own note
     says 16 characters; 32 is allowed here because the tokens expand at issue
     time and a template is longer than the number it produces. */
  if (!e.autoNumberLength && !e.startFrom && buildSample(d).length > 32) {
    e.prefix = 'Prefix, length and suffix together produce a number longer than 32 characters';
  }

  return Object.keys(e).length ? e : null;
}
