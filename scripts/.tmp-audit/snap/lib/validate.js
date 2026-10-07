// /* Validation, de-registried.

//    Was: validate(cfg, body)  - dug fields out of a registry entry.
//    Now: validate(fields, body) - the caller passes its own field array,
//    which each API route imports from its own page folder.

//    Same rules as before, so nothing behaves differently. */

// export function coerce(f, raw) {
//   if (raw === undefined || raw === null || raw === '') {
//     /* a checkbox must resolve to false, never '' - an empty string hitting a
//        Boolean schema path is what produces a Mongoose CastError on create */
//     if (f.type === 'checkbox') return false;
//     if (f.type === 'number') return null;
//     if (f.type === 'date') return null;
//     if (f.type === 'multicity' || f.type === 'multiref') return [];
//     if (f.type === 'ref') return null;
//     return '';
//   }
//   if (f.type === 'number') { const n = Number(raw); return Number.isNaN(n) ? null : n; }
//   if (f.type === 'date') { const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d; }
//   if (f.type === 'multicity') return Array.isArray(raw) ? raw.map(String) : [String(raw)];
//   if (f.type === 'multiref') return Array.isArray(raw) ? raw : [raw];
//   if (f.type === 'checkbox') return raw === true || raw === 'true';
//   return String(raw);
// }

// export function validate(fields, body) {
//   const errors = {};
//   const doc = {};

//   (fields || []).forEach((f) => {
//     if (f.type === 'checkbox') { doc[f.k] = coerce(f, body[f.k]); return; }

//     const val = coerce(f, body[f.k]);
//     const empty = val === null || val === '' || (Array.isArray(val) && val.length === 0);

//     if (f.req && empty) errors[f.k] = f.label + ' is required';
//     doc[f.k] = val;
//   });

//   return { errors, doc, ok: Object.keys(errors).length === 0 };
// }

// /* Search terms go into $regex. Unescaped, `(a+)+$` is a ReDoS and `.*`
//    scans the whole collection. */
// export function escapeRegex(s) {
//   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }










/* Validation, de-registried.

   Was: validate(cfg, body)  - dug fields out of a registry entry.
   Now: validate(fields, body) - the caller passes its own field array,
   which each API route imports from its own page folder.

   Same rules as before, so nothing behaves differently. */

export function coerce(f, raw) {
  if (raw === undefined || raw === null || raw === '') {
    /* a checkbox must resolve to false, never '' - an empty string hitting a
       Boolean schema path is what produces a Mongoose CastError on create */
    if (f.type === 'checkbox') return false;
    if (f.type === 'number') return null;
    if (f.type === 'date' || f.type === 'datetime') return null;
    if (f.type === 'multicity' || f.type === 'multiref' || f.type === 'checkgroup') return [];
    if (f.type === 'ref') return null;
    return '';
  }
  if (f.type === 'number') { const n = Number(raw); return Number.isNaN(n) ? null : n; }
  /* datetime carries a clock time as well; both land on a Date schema path.
     A datetime-local value ("2026-08-27T21:56") is parsed as LOCAL time by
     the Date constructor, which is what the user picked. */
  if (f.type === 'date' || f.type === 'datetime') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (f.type === 'multicity') return Array.isArray(raw) ? raw.map(String) : [String(raw)];
  if (f.type === 'multiref') return Array.isArray(raw) ? raw : [raw];
  /* checkgroup: a fixed list of labels, several of which can be ticked */
  if (f.type === 'checkgroup') return Array.isArray(raw) ? raw.map(String) : [String(raw)];
  if (f.type === 'checkbox') return raw === true || raw === 'true';
  return String(raw);
}

export function validate(fields, body) {
  const errors = {};
  const doc = {};

  (fields || []).forEach((f) => {
    if (f.type === 'checkbox') { doc[f.k] = coerce(f, body[f.k]); return; }

    const val = coerce(f, body[f.k]);
    const empty = val === null || val === '' || (Array.isArray(val) && val.length === 0);

    if (f.req && empty) errors[f.k] = f.label + ' is required';
    doc[f.k] = val;
  });

  return { errors, doc, ok: Object.keys(errors).length === 0 };
}

/* Search terms go into $regex. Unescaped, `(a+)+$` is a ReDoS and `.*`
   scans the whole collection. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}