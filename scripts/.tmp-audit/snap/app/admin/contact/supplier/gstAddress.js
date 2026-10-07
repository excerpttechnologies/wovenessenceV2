/* GST -> billing address lock for the Supplier form.

   A GSTIN carries a registered principal place of business, and that address
   is the one the portal returns. While a GST number is on the form, the
   billing address it governs is shown read-only so it cannot drift away from
   what is registered; clear the GST number and the block is editable again.

   This is deliberately its own module rather than a branch inside the page:
   the add page, the edit page and anything else that mounts the supplier
   form all need the same answer, and the rule is easier to change in one
   place than in three.

   Nothing here saves, validates or transforms - it only answers "is this
   field locked right now", so no API, payload or schema behaviour depends on
   it. Locking is presentational: a record that already has an address keeps
   it, and the server is unchanged. */

/* The billing block /api/gst fills, in the shape the supplier TABS use.
   Shipping is deliberately absent - GST says nothing about where goods are
   delivered, so that address stays the operator's to type.

   `billingAddress` is the merged Address control; its two backing columns are
   listed too so the lock still holds if the form is ever shown unmerged. */
export const GST_LOCKED_ADDRESS_FIELDS = [
  'billingAddress',
  'billingAddressLine1',
  'billingAddressLine2',
  'billingCity',
  'billingDistrict',
  'billingState',
  'billingCountry',
  'billingZipCode',
];

/* A GSTIN is 15 characters. Anything shorter is still being typed, and
   locking the address mid-keystroke would be worse than not locking at all. */
const GSTIN_LENGTH = 15;

export function hasGstNumber(data) {
  return String(data?.gstNo ?? '').trim().length >= GSTIN_LENGTH;
}

/* The state of the address block for the data currently on the form.
   Returns the whole picture rather than a bare boolean so a caller can say
   why the block is locked, not just that it is. */
export function handleGstAddressState(data) {
  const locked = hasGstNumber(data);
  return {
    locked,
    fields: GST_LOCKED_ADDRESS_FIELDS,
    reason: locked
      ? 'Billing address is set from the GST registration. Clear the GST number to edit it.'
      : '',
  };
}

/* The predicate TabbedFormView asks per field, via cfg.isFieldReadOnly. */
export function isGstLockedField(field, data) {
  if (!field || !GST_LOCKED_ADDRESS_FIELDS.includes(field.k)) return false;
  return handleGstAddressState(data).locked;
}
