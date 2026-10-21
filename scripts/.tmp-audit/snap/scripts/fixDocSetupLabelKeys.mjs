/* One-time repair: Doc Setup rows keyed by the list's column TITLES.

   Symptom this fixes
   ------------------
   Masters > Doc Setup shows "No Data" under every business and financial
   year, and every document that should carry a configured series comes out
   as a bare running number - the three Inter Company Auto Purchase Returns
   on file are 0001, 0002 and 0003 instead of TFJ/SR/26/0020 onwards.

   Every row in `docsetup` looks like this:

       { Name: 'Inter Comp Sale ret', Type: 'Inter Company Sales Return',
         Prefix: 'TFJ/SR/[YY]/', Suffix: '', 'Start From': '20',
         Validity: 'Never', 'Fin Year': '2026-2027' }

   Those are the column headings of the Doc Setups list - the header row its
   Export CSV / Excel button writes - not the schema's field names. The rows
   were exported from the list and loaded back through Compass after the
   originals went with a deleted business (docsetup-orphan-backup.json holds
   them; fixOrphanContactBusinessId.mjs repaired that business's contacts).
   Nothing the code reads is present:

     - /api/doc-setup filters on businessId + finYear      -> no row matches
     - lib/docnumber.js filters on documentType, businessId,
       finYear and status                                   -> falls back to 0001
     - autoNumberLength, status and sample are absent; Start From is a string

   What this does
   --------------
   Rewrites each label-keyed row IN PLACE (same _id) into the schema shape

       Name       -> documentName      Type     -> documentType
       Prefix     -> prefix            Suffix   -> suffix
       Start From -> startFrom (Number)
       Validity   -> validity          Fin Year -> finYear

   with "GRC" read as "Goods Receipt Challan" - the only name the code issues
   GRC numbers under - and fills in what the export never carried:

     businessId        the main branch unless --business is given; every
                       document already numbered under these series belongs
                       to it
     autoNumberLength  recovered from docsetup-orphan-backup.json where the
                       same series is listed, otherwise 4 - the numbering
                       service's own default
     status true, description '', and the computed sample

   The label keys are removed. Rows already carrying documentType are left
   alone. A row that fails the form's own validation, or would break the
   one-per-business+type+year rule, is reported and skipped, not written.

   Usage
   -----
     npm run fix:docsetup          # dry run, changes nothing
     npm run fix:docsetup:apply    # writes, after a JSON backup

   Options
     --business=<id>   target business (default: the main branch)
*/

import mongoose from 'mongoose';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const APPLY = process.argv.includes('--apply');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || '';
const TARGET_ARG = arg('business');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/fixDocSetupLabelKeys.mjs');
  process.exit(1);
}

/* The real rules rather than a copy of them: the validation the API applies
   and the sample it computes. Reached by URL the way testDocSetup.mjs does,
   since the file lives outside scripts/. */
const { buildSample, validateSetup } = await import(
  pathToFileURL(path.join(process.cwd(), 'lib', 'docSetup.js')).href
);

/* Column titles from app/admin/setting/docsetup/page.jsx, plus the form
   labels from fields.js in case a fuller export was loaded. */
const LABELS = {
  'Name': 'documentName',
  'Document Name': 'documentName',
  'Type': 'documentType',
  'Document Type': 'documentType',
  'Description': 'description',
  'Prefix': 'prefix',
  'Suffix': 'suffix',
  'Auto Number Length': 'autoNumberLength',
  'Start From': 'startFrom',
  'Validity': 'validity',
  'Fin Year': 'finYear',
  'Financial Year': 'finYear',
};

/* A short name for a type that is not the name the code numbers under. */
const TYPE_ALIASES = { GRC: 'Goods Receipt Challan' };

/* Everything models/DocSetup.js declares. Any other key on a row is a label
   (or noise) and is removed. */
const SCHEMA_KEYS = new Set([
  'businessId', 'finYear', 'documentName', 'documentType', 'description', 'prefix', 'suffix',
  'autoNumberLength', 'startFrom', 'sample', 'validity', 'status', 'createdAt', 'updatedAt', '__v',
]);

const BACKUP_FILE = path.join(process.cwd(), 'docsetup-orphan-backup.json');
const backup = existsSync(BACKUP_FILE) ? JSON.parse(readFileSync(BACKUP_FILE, 'utf8')) : [];

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const setups = db.collection('docsetup');

/* ---------------------------------------------------------------- target -- */

const businesses = await db.collection('business').find({}).toArray();
const target = TARGET_ARG
  ? businesses.find((b) => String(b._id) === TARGET_ARG)
  : businesses.find((b) => b.isMainBranch) || businesses[0];

if (!target) {
  console.error(TARGET_ARG
    ? `No business with _id ${TARGET_ARG}.`
    : 'No business to attach the setups to - is the `business` collection empty?');
  process.exit(1);
}
console.log(`Businesses on record: ${businesses.length}`);
businesses.forEach((b) => console.log(`  ${b._id}  ${b.name}${b.isMainBranch ? '   [main branch]' : ''}`));
console.log(`\nTarget business: ${target._id}  ${target.name}\n`);

/* ------------------------------------------------------------------ rows -- */

const all = await setups.find({}).toArray();
const fine = all.filter((r) => r.documentType !== undefined);
const broken = all.filter((r) => r.documentType === undefined);

console.log(`Doc Setup rows: ${all.length}  (${fine.length} in schema shape, ${broken.length} keyed by label)`);
if (!broken.length) {
  console.log('Nothing to repair.');
  await mongoose.disconnect();
  process.exit(0);
}

/* --------------------------------------------------------------- convert -- */

const norm = (s) => String(s ?? '').trim().toLowerCase();

/* Auto Number Length is not a list column, so the export never had it. The
   backup of the originals does: take it from the row of the same type,
   preferring a match on name, then on prefix, and only falling back to an
   unambiguous type match. Lengths the form would reject are not candidates. */
function recoverLength(doc) {
  const sane = backup.filter((b) => b.documentType === doc.documentType
    && Number.isInteger(b.autoNumberLength) && b.autoNumberLength >= 1 && b.autoNumberLength <= 16);
  const same = (k) => sane.find((b) => norm(b[k]) === norm(doc[k]));
  const pick = same('documentName') || same('prefix') || (sane.length === 1 ? sane[0] : null);
  return pick
    ? { len: pick.autoNumberLength, from: `from backup "${pick.documentName}"` }
    : { len: 4, from: 'default - not in backup' };
}

function convert(row) {
  const doc = {};
  for (const [label, key] of Object.entries(LABELS)) {
    if (row[label] === undefined || row[label] === null) continue;
    doc[key] = typeof row[label] === 'string' ? row[label].trim() : row[label];
  }

  doc.documentType = TYPE_ALIASES[doc.documentType] || doc.documentType || '';
  doc.documentName = doc.documentName || '';
  doc.description = doc.description || '';
  doc.prefix = doc.prefix || '';
  doc.suffix = doc.suffix || '';
  doc.validity = doc.validity || 'Never';
  doc.finYear = doc.finYear || '';
  doc.startFrom = Number(doc.startFrom);
  doc.status = true;
  doc.businessId = target._id;

  let lengthFrom = 'from the export';
  const given = Number(doc.autoNumberLength);
  if (!(Number.isInteger(given) && given >= 1 && given <= 16)) {
    const r = recoverLength(doc);
    doc.autoNumberLength = r.len;
    lengthFrom = r.from;
  }

  doc.sample = buildSample(doc);

  const unset = Object.keys(row).filter((k) => k !== '_id' && !SCHEMA_KEYS.has(k));
  return { doc, lengthFrom, unset };
}

const plan = broken.map((row) => ({ row, ...convert(row) }));

/* ------------------------------------------------------------ validation -- */

/* One config per business + type + year. The unique index would reject the
   write anyway, but a clash is worth naming before anything is touched. */
const tripleOf = (d) => `${String(d.businessId)}|${d.documentType}|${d.finYear}`;
const taken = new Map(fine.map((r) => [tripleOf(r), r.documentName]));

console.log('\n--- REPAIR PLAN ---');
const ok = [];
const skipped = [];
for (const p of plan) {
  const { row, doc, lengthFrom, unset } = p;
  const problems = [];

  const bad = validateSetup(doc);
  if (bad) Object.values(bad).forEach((m) => problems.push(m));

  const key = tripleOf(doc);
  if (taken.has(key)) {
    problems.push(`"${doc.documentType}" for ${doc.finYear} already exists on this business (${taken.get(key)})`);
  }

  const typeNote = row.Type !== undefined && row.Type !== doc.documentType
    ? `   (Type "${row.Type}" read as "${doc.documentType}")` : '';
  console.log(`\n  ${row._id}  ${doc.documentName}`);
  console.log(`      documentType    ${doc.documentType}${typeNote}`);
  console.log(`      prefix / suffix "${doc.prefix}" / "${doc.suffix}"`);
  console.log(`      length          ${doc.autoNumberLength}   (${lengthFrom})`);
  console.log(`      startFrom       ${doc.startFrom}   validity ${doc.validity}   finYear ${doc.finYear}`);
  console.log(`      sample          ${doc.sample}`);
  console.log(`      remove keys     ${unset.map((k) => JSON.stringify(k)).join(', ')}`);

  if (problems.length) {
    problems.forEach((m) => console.log(`      SKIP  ${m}`));
    skipped.push(p);
  } else {
    taken.set(key, doc.documentName);
    ok.push(p);
  }
}

console.log(`\n${ok.length} row(s) would be repaired onto ${target.name}${skipped.length ? `, ${skipped.length} skipped` : ''}.`);
if (!APPLY) {
  console.log('\nDRY RUN - nothing written. Re-run with --apply to make the change.');
  await mongoose.disconnect();
  process.exit(0);
}
if (!ok.length) {
  console.log('\nNothing writable.');
  await mongoose.disconnect();
  process.exit(1);
}

/* ------------------------------------------------------------------ apply -- */

const dir = path.join(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `docsetup-label-keys-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(broken, null, 2));
console.log(`\nBackup written: ${file}`);

/* createdAt is the insert time the _id already carries; only updatedAt is now */
const now = new Date();
const res = await setups.bulkWrite(ok.map(({ row, doc, unset }) => ({
  updateOne: {
    filter: { _id: row._id },
    update: {
      $set: { ...doc, createdAt: row._id.getTimestamp(), updatedAt: now, __v: 0 },
      ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
    },
  },
})), { ordered: false });
console.log(`Rows rewritten: matched ${res.matchedCount}, modified ${res.modifiedCount}`);

/* ----------------------------------------------------------------- verify -- */

/* The two queries the app actually runs: the list (business + year) and the
   numbering lookup (type + business + year + status). */
console.log('\n--- VERIFY ---');
for (const y of [...new Set(ok.map((p) => p.doc.finYear))]) {
  const n = await setups.countDocuments({ businessId: target._id, finYear: y });
  console.log(`  /api/doc-setup?business=${target._id}&finYear=${y}  ->  ${n} row(s)`);
}
for (const { doc } of ok) {
  const hit = await setups.findOne({
    documentType: doc.documentType, businessId: target._id, finYear: doc.finYear, status: { $ne: false },
  });
  console.log(`  nextDocNumber("${doc.documentType}")  ->  ${hit ? `series ${hit.sample}` : 'NOT FOUND'}`);
}
console.log(`\nRows still keyed by label: ${await setups.countDocuments({ documentType: { $exists: false } })}`);

await mongoose.disconnect();
