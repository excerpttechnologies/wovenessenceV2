/* Display-name aliases for customer contact types.

   The stored ContactType.name is left untouched - it also feeds the prefix
   used by nextContactId when generating contact codes, and reports/imports
   may match on it. These aliases only change what pickers and lists show,
   and only for rows whose contactType is 'Customer'. */

const CUSTOMER_TYPE_LABELS = {
  'B2B INTERSTORES': 'B2B SALES',
  'RETAIL': 'E-COMM',
};

export function contactTypeDisplayName(name, contactType) {
  const text = String(name ?? '').trim();
  if (contactType !== 'Customer') return text;
  return CUSTOMER_TYPE_LABELS[text.toUpperCase()] || text;
}
