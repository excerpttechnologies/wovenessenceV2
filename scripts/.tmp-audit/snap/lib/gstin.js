/* GSTIN - one normalisation and one format rule for the whole app.

   Client-safe: no database, no environment. The supplier form, the supplier
   API, /api/gst/lookup and the supplier Excel import scripts all import from
   here, so " 29abcde1234f1z5" and "29ABCDE1234F1Z5" can never be the same
   number to one of them and two different numbers to another. */

/* 2-digit state code + 10-character PAN + entity number + the letter Z +
   checksum character. The pattern /api/gst/lookup and the Excel seeder
   already used, now held in one place. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/* Leading/trailing spaces dropped and upper-cased - nothing else. Spaces
   INSIDE the number are left alone, so the format check reports them rather
   than this quietly repairing them. */
export function normalizeGstin(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function isValidGstin(value) {
  return GSTIN_RE.test(normalizeGstin(value));
}

export const GSTIN_FORMAT_MESSAGE = 'Enter a valid GST number.';
export const GSTIN_DUPLICATE_MESSAGE = 'GST number already exists for another supplier.';
/* for a duplicate that only the save itself caught - the form had said the
   number was free, so the operator is told to look again, not just "no" */
export const GSTIN_DUPLICATE_ON_SAVE_MESSAGE =
  'GST number already exists for another supplier. Please refresh and verify the supplier details.';
