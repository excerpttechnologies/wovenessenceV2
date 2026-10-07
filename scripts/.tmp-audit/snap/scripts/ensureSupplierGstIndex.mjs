/* Build the one-supplier-per-GST-number index on an existing database.

   WHY THIS IS A SCRIPT AND NOT LEFT TO THE SCHEMA.

   models/Contact.js declares SUPPLIER_GST_INDEX: unique on (businessId,
   gstNo) for suppliers that carry a GST number, compared case-blind. On an
   empty database Mongoose would build it on first use. On this one that
   cannot be relied on: a unique index build fails outright when two
   suppliers already share a number, and under autoIndex that failure happens
   in the background of whichever request first loads the model, where nobody
   sees it. The app would go on believing the rule is enforced when it is
   not. So it is built here, on purpose, after the data has been looked at.

   WHY IT REFUSES ON DUPLICATES INSTEAD OF FIXING THEM.

   Two suppliers with the same GST number in one business are two records a
   person entered, and either may be referenced by GRCs, deliveries, invoices
   and barcode labels. Which one is the real supplier - and whether the other
   should be merged, or corrected to a different GSTIN - is a business
   decision the data cannot make, and deleting or blanking either would
   corrupt history. Every member of every group is listed and the script
   stops. No record is changed, with or without --apply.

   Duplicates are grouped by the NORMALISED number (trim + upper case, as
   lib/gstin.js does). That is stricter than the index: its collation is
   case-blind but not space-blind, so " 29ABCDE1234F1Z5" and
   "29ABCDE1234F1Z5" would both fit in it. They are still one GSTIN, and the
   supplier API treats them as one, so they are reported as duplicates. A
   second grouping runs on the server under the index's own filter and
   collation - the exact comparison the build will make - and catches what
   the stricter check leaves out, such as two identical whitespace-only
   values, which normalise to "no GST" but are still indexed.

   SAFE BY DEFAULT. It reports and exits. Pass --apply to create the index.
   An index already present under the same name is compared with the spec
   and reported - never dropped or replaced. Exit code 1 whenever something
   needs a person: duplicates, an index with different options, or a failed
   build. Nothing is written to disk; the report is console output only.

     npm run suppliers:gst-index              dry run
     npm run suppliers:gst-index:apply        create the index if the data allows
*/

import mongoose from 'mongoose';
import { normalizeGstin, isValidGstin } from '../lib/gstin.js';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env');
  process.exit(1);
}

/* NOTHING MAY BE BUILT BEHIND THIS SCRIPT'S BACK.

   Loading models/Contact.js compiles the contact model, and with Mongoose's
   default autoIndex the connection would then build EVERY schema index on
   the collection - the unique GST index included - as soon as it opened,
   dry run or not, before a single duplicate had been looked for. Both
   switches are turned off globally here, and again on the connection below.
   The model is loaded only for its index spec; every read and the one
   createIndex go through the raw driver collection. */
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

/* Loaded AFTER the switches, not with the static imports above - those are
   hoisted and would compile the model first. Mongoose 8 happens to read the
   switches only when the connection opens, but this does not depend on it. */
const { SUPPLIER_GST_INDEX } = await import('../models/Contact.js');

const SPEC = SUPPLIER_GST_INDEX;
const INDEX_NAME = SPEC.options.name;

async function main() {
  console.log(APPLY
    ? '=== APPLYING (the index is created only if no duplicates are found) ==='
    : '=== DRY RUN (pass --apply to create the index) ===');

  await mongoose.connect(URI, { autoIndex: false, autoCreate: false });
  const contacts = mongoose.connection.db.collection('contact');

  console.log(`collection : contact`);
  console.log(`index spec : ${INDEX_NAME}  ${JSON.stringify(SPEC.key)}`);

  const before = await indexesOf(contacts);
  console.log(`\nindexes on contact now (${before.length}):`);
  printIndexes(before);

  /* ------------------------------------------------------ analysis ------ */
  const suppliers = await contacts.find(
    { contactKind: 'Supplier' },
    { projection: { businessId: 1, contactId: 1, businessName: 1, gstNo: 1 } }
  ).toArray();

  const has = (s) => Object.prototype.hasOwnProperty.call(s, 'gstNo');
  const isStr = (s) => typeof s.gstNo === 'string';

  const missing = suppliers.filter((s) => !has(s) || s.gstNo === null || s.gstNo === undefined);
  /* The index filter is gstNo > '', and a comparison only matches values of
     the same type - so a number or anything else stored here is never
     indexed, and never blocked. */
  const notString = suppliers.filter((s) => has(s) && s.gstNo != null && !isStr(s));
  const empty = suppliers.filter((s) => s.gstNo === '');
  const blank = suppliers.filter((s) => isStr(s) && s.gstNo !== '' && s.gstNo.trim() === '');
  const padded = suppliers.filter((s) => isStr(s) && s.gstNo.trim() !== '' && s.gstNo.trim() !== s.gstNo);
  const lower = suppliers.filter((s) => isStr(s) && /[a-z]/.test(s.gstNo));
  const withGst = suppliers.filter((s) => normalizeGstin(s.gstNo) !== '');
  const invalid = withGst.filter((s) => !isValidGstin(s.gstNo));

  console.log('\n================= SUPPLIER GST NUMBERS =================');
  console.log(`suppliers                                   : ${suppliers.length}`);
  console.log(`gstNo missing or null                       : ${missing.length}`);
  console.log(`gstNo not a string (never indexed)          : ${notString.length}`);
  console.log(`gstNo empty ('' - no GST)                   : ${empty.length}`);
  console.log(`gstNo whitespace only (normalises to no GST): ${blank.length}`);
  console.log(`gstNo with leading/trailing spaces          : ${padded.length}`);
  console.log(`gstNo containing lower-case letters         : ${lower.length}`);
  console.log(`gstNo not in GSTIN format                   : ${invalid.length}`);
  console.log(`carrying a GST number (after trim + upper)  : ${withGst.length}`);

  listRows('NOT A STRING - outside the index, so not protected by it', notString);
  listRows('WHITESPACE ONLY - "no GST" to the app, but the index still holds them', blank);
  listRows('LEADING/TRAILING SPACES - the index tells these apart from the unpadded number', padded);
  listRows('LOWER-CASE - fine for the index (case-blind), shown so they can be tidied', lower);
  listRows('NOT IN GSTIN FORMAT - the index does not check format; left for a person to correct', invalid);

  /* Same business + same normalised number. businessId is compared as text
     so a missing one groups with other missing ones - the index would put
     them side by side too. */
  const byBusiness = new Map();
  const byNumber = new Map();
  for (const s of withGst) {
    const gst = normalizeGstin(s.gstNo);
    const key = String(s.businessId) + '|' + gst;
    if (!byBusiness.has(key)) byBusiness.set(key, { businessId: String(s.businessId), gst, members: [] });
    byBusiness.get(key).members.push(s);
    if (!byNumber.has(gst)) byNumber.set(gst, new Map());
    const biz = byNumber.get(gst);
    if (!biz.has(String(s.businessId))) biz.set(String(s.businessId), []);
    biz.get(String(s.businessId)).push(s);
  }
  const dupes = [...byBusiness.values()].filter((g) => g.members.length > 1);

  console.log(`\nDUPLICATE GST NUMBERS WITHIN A BUSINESS (trim + upper case): ${dupes.length} group(s)`);
  const listed = new Set();
  dupes.forEach((g) => {
    console.log(`  business ${g.businessId}  gst ${g.gst}  x${g.members.length}`);
    g.members.forEach((s) => { listed.add(String(s._id)); console.log('     ' + row(s)); });
  });

  /* Allowed by the rule - the rule is per business - so never a blocker.
     Shown because a number shared across branches is usually worth knowing. */
  const shared = [...byNumber.entries()].filter(([, biz]) => biz.size > 1);
  console.log(`\nsame GST number in DIFFERENT businesses (allowed, informational): ${shared.length}`);
  shared.forEach(([gst, biz]) => {
    console.log(`  gst ${gst}  in ${biz.size} businesses`);
    for (const [businessId, members] of biz) {
      members.forEach((s) => console.log(`     business ${businessId}  ${row(s)}`));
    }
  });

  /* The comparison the build itself will make: the index's own partial
     filter, grouped on its own key fields, under its own collation. */
  const groupKey = Object.fromEntries(Object.keys(SPEC.key).map((k) => [k, '$' + k]));
  const indexDupes = await contacts.aggregate([
    { $match: SPEC.options.partialFilterExpression },
    {
      $group: {
        _id: groupKey,
        n: { $sum: 1 },
        members: { $push: { _id: '$_id', contactId: '$contactId', businessName: '$businessName', gstNo: '$gstNo' } },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ], { collation: SPEC.options.collation }).toArray();

  console.log(`\nduplicates exactly as the index compares them (collation ${SPEC.options.collation.locale}/strength ${SPEC.options.collation.strength}): ${indexDupes.length} group(s)`);
  indexDupes.forEach((g) => {
    const label = Object.entries(g._id).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('  ');
    if (g.members.every((m) => listed.has(String(m._id)))) {
      console.log(`  ${label}  x${g.n} - members listed above`);
      return;
    }
    console.log(`  ${label}  x${g.n}`);
    g.members.forEach((m) => console.log('     ' + row(m)));
  });
  console.log('========================================================');

  /* ------------------------------------------------- existing index ----- */
  const existing = before.find((ix) => ix.name === INDEX_NAME);
  const sameKey = before.filter((ix) => ix.name !== INDEX_NAME && sameKeyPattern(ix.key, SPEC.key));
  if (sameKey.length) {
    console.log(`\nnote: other index(es) already on ${JSON.stringify(SPEC.key)}: ${sameKey.map((ix) => ix.name).join(', ')}`);
    console.log('      They are left alone. A build under the same key and collation would be refused by the server.');
  }

  const blocked = dupes.length > 0 || indexDupes.length > 0;

  if (existing) {
    const diffs = differencesFromSpec(existing);
    if (diffs.length) {
      console.log(`\nIndex "${INDEX_NAME}" is present with DIFFERENT options:`);
      diffs.forEach((d) => console.log('  ' + d));
      console.log('It has NOT been dropped or replaced - that is a decision for a person,');
      console.log('and until it is resolved the GST rule is enforced by the supplier API alone.');
      process.exitCode = 1;
    } else {
      console.log(`\nIndex "${INDEX_NAME}" is already present, matching the spec. Nothing to do.`);
      if (blocked) {
        console.log('The duplicates listed above are ones the index permits (padded values); they still need a person.');
        process.exitCode = 1;
      }
    }
    return;
  }

  /* ----------------------------------------------------- refuse -------- */
  if (blocked) {
    console.log(`\nINDEX NOT CREATED: ${dupes.length} duplicate group(s) by normalised number,`);
    console.log(`${indexDupes.length} as the index compares them - every member is listed above.`);
    console.log('No record was changed. Each group has to be resolved by a person - decide which');
    console.log('supplier holds the number and correct the other record - then run this again.');
    process.exitCode = 1;
    return;
  }

  /* ------------------------------------------------------ build -------- */
  const { name, ...options } = SPEC.options;
  if (!APPLY) {
    console.log('\nNo duplicates. With --apply this would be created on contact:');
    console.log(`  name    : ${name}`);
    console.log(`  key     : ${JSON.stringify(SPEC.key)}`);
    console.log(`  options : ${JSON.stringify(options)}`);
    console.log('\nDry run - nothing was written.');
    return;
  }

  console.log(`\nNo duplicates. Creating "${INDEX_NAME}"...`);
  try {
    const created = await contacts.createIndex(SPEC.key, SPEC.options);
    console.log(`  created: ${created}`);
  } catch (err) {
    /* A failed build leaves no index behind, and createIndex never touches
       documents. Most likely cause: a supplier saved with a duplicate number
       between the check above and the build. */
    console.log(`  FAILED: ${err.codeName || err.code || ''} ${err.message}`);
    console.log('  The index was NOT created and no record was changed. Run the dry run again.');
    process.exitCode = 1;
    return;
  }

  const after = await indexesOf(contacts);
  console.log(`\nindexes on contact now (${after.length}):`);
  printIndexes(after);
  console.log('\nIndex build complete.');
}

/* ============================================================ helpers == */

async function indexesOf(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (err) {
    /* no collection yet means no indexes yet - listing must not create it */
    if (err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

function printIndexes(indexes) {
  if (!indexes.length) { console.log('  (none)'); return; }
  indexes.forEach((ix) => {
    const flags = [
      ix.unique && 'unique',
      ix.partialFilterExpression && 'partial ' + JSON.stringify(ix.partialFilterExpression),
      ix.collation && `collation ${ix.collation.locale}/${ix.collation.strength}`,
    ].filter(Boolean).join('  ');
    console.log(`  ${String(ix.name).padEnd(28)} ${JSON.stringify(ix.key)}${flags ? '  ' + flags : ''}`);
  });
}

function row(s) {
  const raw = Object.prototype.hasOwnProperty.call(s, 'gstNo') ? JSON.stringify(s.gstNo) : '(missing)';
  return `${String(s._id)}  ${String(s.contactId ?? '').padEnd(7)} ${String(s.businessName ?? '').padEnd(30)} gstNo=${raw}`;
}

function listRows(title, rows) {
  if (!rows.length) return;
  console.log(`\n${title}: ${rows.length}`);
  rows.forEach((s) => console.log('     ' + row(s)));
}

/* a compound key's field ORDER is part of the index, so it is compared in
   order, not as a set */
function sameKeyPattern(a, b) {
  return JSON.stringify(Object.entries(a || {})) === JSON.stringify(Object.entries(b || {}));
}

/* a filter's field order is not significant, so it is compared with keys
   sorted at every level */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  }
  return v;
}

function differencesFromSpec(ix) {
  const o = SPEC.options;
  const diffs = [];
  if (!sameKeyPattern(ix.key, SPEC.key)) {
    diffs.push(`key                     : ${JSON.stringify(ix.key)}  (spec ${JSON.stringify(SPEC.key)})`);
  }
  if (Boolean(ix.unique) !== Boolean(o.unique)) {
    diffs.push(`unique                  : ${Boolean(ix.unique)}  (spec ${Boolean(o.unique)})`);
  }
  if (JSON.stringify(canonical(ix.partialFilterExpression ?? null)) !== JSON.stringify(canonical(o.partialFilterExpression ?? null))) {
    diffs.push(`partialFilterExpression : ${JSON.stringify(ix.partialFilterExpression ?? null)}  (spec ${JSON.stringify(o.partialFilterExpression ?? null)})`);
  }
  /* the server fills in every collation default; only the two the spec
     sets are compared */
  const c = ix.collation || {};
  if (c.locale !== o.collation?.locale || c.strength !== o.collation?.strength) {
    diffs.push(`collation               : ${JSON.stringify({ locale: c.locale, strength: c.strength })}  (spec ${JSON.stringify(o.collation)})`);
  }
  return diffs;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
