/* ==========================================================================
   Purchase Rate Code - digit <-> letter substitution.

   The Purchase Rate Code Master (Masters -> Purchase Rate Code Master) lets an
   admin choose which letter stands for each digit 0-9, so a cost price can be
   written on a label in a form the shop floor cannot read at a glance. This
   file holds the pure logic; it has no database or React dependency so the
   master page, the barcode generation screen and any server route can all
   share exactly one implementation.

   WHAT IS AND IS NOT MAPPED, and why each choice is deliberate:

     0-9   substituted with whatever the ACTIVE master says. Never a built-in
           default - an unconfigured master encodes nothing (see encodeRate).

           0 joined the master after 1-9. A record saved before then has no
           code for 0; it still encodes, printing 0 as 0, until an admin gives
           0 a code and saves (a save now requires one - see validateMapping).

     .     preserved, so 119583.05 keeps its decimal point.
     -     preserved, so a negative rate stays recognisably negative.

   Any other character is passed through untouched rather than dropped: losing
   a character silently would make the encoded value undecodable.
   ========================================================================== */

/* The digits the master configures. Order matters - the master page renders
   its rows in this order. */
export const CODE_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/* The digits a mapping needs before it can encode at all. 0 is left out so a
   record saved before 0 joined the master keeps encoding (0 passes through as
   0) instead of silently printing nothing on every label. */
const ENCODE_REQUIRED_DIGITS = CODE_DIGITS.filter((digit) => digit !== '0');

export const PASSTHROUGH_NOTE =
  'The decimal point and minus sign are preserved.';

/* Trim, upper-case, and keep only the digits the master owns. Applied on the
   way in AND on the way out of the database, so a record saved by an older
   build - or edited by hand - still behaves. */
export function normaliseMapping(raw) {
  const out = {};
  CODE_DIGITS.forEach((digit) => {
    const value = raw && raw[digit] != null ? String(raw[digit]).trim().toUpperCase() : '';
    if (value) out[digit] = value;
  });
  return out;
}

/* Every rule the master enforces before a mapping may be saved. Returned as a
   list rather than thrown, so the page can show all the problems at once
   instead of one per save attempt. */
export function validateMapping(raw) {
  const mapping = normaliseMapping(raw);
  const errors = [];

  const missing = CODE_DIGITS.filter((digit) => !mapping[digit]);
  if (missing.length) {
    errors.push(`Every digit needs a code - missing for ${missing.join(', ')}.`);
  }

  /* Duplicates make decoding ambiguous: given "A" there would be no way to
     know which digit was meant. */
  const seen = new Map();
  const duplicated = new Set();
  Object.entries(mapping).forEach(([digit, code]) => {
    if (seen.has(code)) {
      duplicated.add(code);
      seen.get(code).push(digit);
    } else {
      seen.set(code, [digit]);
    }
  });
  duplicated.forEach((code) => {
    errors.push(`Each digit must have a unique code - "${code}" is used by digits ${seen.get(code).join(' and ')}.`);
  });

  /* A code containing a digit could not be told apart from a digit that was
     passed through unchanged, leaving a value that cannot be decoded back. */
  const numeric = Object.entries(mapping).filter(([, code]) => /[0-9]/.test(code));
  numeric.forEach(([digit, code]) => {
    errors.push(`Digit ${digit}: a code may not contain a number ("${code}") - it would be confused with a plain digit when decoding.`);
  });

  return { ok: errors.length === 0, errors, mapping };
}

/* Built fresh from the active mapping every time - never a stored or
   hardcoded reverse table, so changing the master immediately changes how
   values decode. */
export function invertMapping(raw) {
  const mapping = normaliseMapping(raw);
  const reverse = {};
  Object.entries(mapping).forEach(([digit, code]) => {
    /* First writer wins, so a mapping that slipped through with duplicates
       decodes deterministically rather than depending on key order. */
    if (!(code in reverse)) reverse[code] = digit;
  });
  return reverse;
}

export function isMappingComplete(raw) {
  const mapping = normaliseMapping(raw);
  return ENCODE_REQUIRED_DIGITS.every((digit) => Boolean(mapping[digit]));
}

/* Encode a real purchase rate. `rate` is used exactly as given - it is never
   rounded, padded or reformatted, because the number shown to the user and
   the number stored in the database must stay byte-identical.

   Returns '' when there is no usable mapping, so a caller can tell "not
   configured yet" from a genuine result and show nothing rather than a
   half-substituted string. */
export function encodeRate(rate, raw) {
  const value = rate == null ? '' : String(rate).trim();
  if (!value) return '';
  if (!isMappingComplete(raw)) return '';

  const mapping = normaliseMapping(raw);
  return value
    .split('')
    .map((char) => (mapping[char] !== undefined ? mapping[char] : char))
    .join('');
}

/* The inverse. Codes may be more than one character, so the longest code is
   tried first - otherwise a mapping containing both "A" and "AB" would decode
   "AB" as digit-A followed by a stray "B". */
export function decodeRate(encoded, raw) {
  const value = encoded == null ? '' : String(encoded).trim();
  if (!value) return '';
  if (!isMappingComplete(raw)) return '';

  const reverse = invertMapping(raw);
  const codes = Object.keys(reverse).sort((a, b) => b.length - a.length);

  let out = '';
  let i = 0;
  while (i < value.length) {
    const match = codes.find((code) => code && value.startsWith(code, i));
    if (match) {
      out += reverse[match];
      i += match.length;
    } else {
      /* '.', '-', an unmapped 0 from an older record, and anything else the
         encoder passed through */
      out += value[i];
      i += 1;
    }
  }
  return out;
}
