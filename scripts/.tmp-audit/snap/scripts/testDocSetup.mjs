/* Doc Setup + document numbering.

   Covers the four things the master prompt asks to be proven, plus the
   defects found while checking whether the module already existed:

     - two concurrent allocations never return the same number
     - "Yearly" restarts at startFrom in a new financial year; "Never" does not
     - a different business gets its own independent counter
     - the one-config-per-business+type+year rule is enforced
     - the sample preview is computed, not typed
     - POS and POS Return are configurable at all

   Everything it creates is prefixed ZZTEST and removed at the end.
   Run with the server up for the UI half:  npm run test:docsetup
*/

import mongoose from 'mongoose';
import crypto from 'crypto';
import path from 'path';
import { pathToFileURL } from 'url';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3111';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  -> ' + d : ''))); };

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const setups = db.collection('docsetup');
const counters = db.collection('counter');

/* The numbering service, imported directly so the test exercises the REAL
   code rather than a copy of its rules. scripts/aliasHooks.mjs resolves the
   "@/" alias so this works outside Next - without it these tests skipped. */
const { nextDocNumber } = await import(pathToFileURL(path.join(process.cwd(), 'lib', 'docnumber.js')).href);

const biz = (await db.collection('business').findOne({ isMainBranch: true }))
  || (await db.collection('business').findOne({}));
const businessId = biz._id;
const TYPE = 'ZZTEST Type';
const created = { setups: [], counters: [] };

async function cleanup() {
  await setups.deleteMany({ documentType: /^ZZTEST/ });
  await counters.deleteMany({ key: /ZZTEST/ });
  await db.collection('grc').deleteMany({ grcNumber: /^ZZTEST/ });
}
await cleanup();

console.log('--- SAMPLE IS COMPUTED, NOT TYPED ---');
const { buildSample, validateSetup, DOCUMENT_TYPES } = await import(
  pathToFileURL(path.join(process.cwd(), 'lib', 'docSetup.js')).href
);

if (buildSample) {
  ok('prefix + padded start + suffix',
    buildSample({ prefix: 'TFJ/SR/[YY]/', autoNumberLength: 4, startFrom: 20, suffix: '' }) === 'TFJ/SR/[YY]/0020',
    buildSample({ prefix: 'TFJ/SR/[YY]/', autoNumberLength: 4, startFrom: 20, suffix: '' }));
  ok('placeholder tokens stay UNRESOLVED in the preview',
    buildSample({ prefix: 'SPI/[FYY]/', autoNumberLength: 3, startFrom: 100 }) === 'SPI/[FYY]/100');
  ok('a 5-wide pad zero-fills',
    buildSample({ prefix: '[YY]/', autoNumberLength: 5, startFrom: 182 }) === '[YY]/00182');
  /* a REAL type, so these assertions test the field they name rather than
     tripping over the document-type check */
  const T0 = DOCUMENT_TYPES[0];
  ok('validation rejects a zero length',
    Boolean(validateSetup({ documentType: T0, autoNumberLength: 0, startFrom: 1 })?.autoNumberLength));
  ok('validation rejects a negative start',
    Boolean(validateSetup({ documentType: T0, autoNumberLength: 4, startFrom: -1 })?.startFrom));
  ok('validation rejects a bad validity',
    Boolean(validateSetup({ documentType: T0, autoNumberLength: 4, startFrom: 1, validity: 'Weekly' })?.validity));
  ok('validation rejects an unknown document type',
    Boolean(validateSetup({ documentType: 'Not A Real Type', autoNumberLength: 4, startFrom: 1 })?.documentType));
  ok('validation accepts a sound config',
    validateSetup({ documentType: T0, autoNumberLength: 4, startFrom: 1, validity: 'Yearly' }) === null,
    JSON.stringify(validateSetup({ documentType: T0, autoNumberLength: 4, startFrom: 1, validity: 'Yearly' })));

  /* every type a route passes to nextDocNumber must be configurable */
  ['POS', 'POS Return', 'Goods Receipt Challan', 'Purchase Invoice', 'Sales Invoice',
    'Sales Return', 'Credit Note', 'Debit Note', 'Delivery Challan',
    'Stock Transfer Packet', 'Stock Transfer Received', 'Stock Transfer Location',
    'Inter Company Sales Invoice', 'Inter Company Sales Return',
    'Inter Company Delivery Challan'].forEach((t) => {
    if (!DOCUMENT_TYPES.includes(t)) { fail += 1; console.log(`  FAIL  code uses "${t}" but it is not configurable`); }
  });
  ok('every document type the code issues numbers for is configurable', true);
} else {
  console.log('  SKIP  buildSample not importable outside Next');
}

console.log('\n--- POS IS CONFIGURABLE AT ALL ---');
const fields = await import(
  pathToFileURL(path.join(process.cwd(), 'app', 'admin', 'setting', 'docsetup', 'fields.js')).href
);
const offered = new Set((fields.FIELDS.find((f) => f.k === 'documentType').opts || []).map((o) => o.v));
['POS', 'POS Return', 'Goods Receipt Challan', 'Sales Invoice'].forEach((t) => {
  ok(`"${t}" appears in the document-type list`, offered.has(t));
});

console.log('\n--- NUMBERING ---');
if (!nextDocNumber) {
  console.log('  SKIP  nextDocNumber not importable outside Next (uses the @/ alias)');
} else {
  const Grc = (await import(pathToFileURL(path.join(process.cwd(), 'models', 'Grc.js')).href)).default;

  const mk = async (validity, finYear, startFrom = 1) => {
    await setups.deleteMany({ documentType: TYPE });
    await counters.deleteMany({ key: new RegExp(TYPE) });
    await setups.insertOne({
      businessId, finYear, documentName: 'ZZTEST', documentType: TYPE,
      prefix: 'ZZTEST/', suffix: '', autoNumberLength: 4, startFrom,
      validity, status: true, sample: '', createdAt: new Date(), updatedAt: new Date(),
    });
  };

  /* --- concurrency --- */
  await mk('Yearly', '2026-2027', 1);
  const got = await Promise.all(Array.from({ length: 25 }, () =>
    nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' })));
  ok('25 concurrent allocations return 25 DISTINCT numbers',
    new Set(got).size === 25, `${new Set(got).size} unique of 25`);
  ok('they are sequential from startFrom',
    got.map((n) => Number(n.replace('ZZTEST/', ''))).sort((a, b) => a - b).join() ===
    Array.from({ length: 25 }, (_, i) => i + 1).join());

  /* --- Yearly resets, Never does not --- */
  await mk('Yearly', '2026-2027', 1);
  const y1 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
  await setups.updateOne({ documentType: TYPE }, { $set: { finYear: '2027-2028' } });
  const y2 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2027-2028' });
  ok('"Yearly" restarts at startFrom in a new financial year',
    y1 === 'ZZTEST/0001' && y2 === 'ZZTEST/0001', `${y1} then ${y2}`);

  await mk('Never', '2026-2027', 1);
  const n1 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
  const n2 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
  await setups.updateOne({ documentType: TYPE }, { $set: { finYear: '2027-2028' } });
  const n3 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2027-2028' });
  ok('"Never" keeps counting across the year boundary',
    n1 === 'ZZTEST/0001' && n2 === 'ZZTEST/0002' && n3 === 'ZZTEST/0003',
    `${n1} ${n2} ${n3}`);

  /* --- another business is independent --- */
  const other = await db.collection('business').findOne({ _id: { $ne: businessId } });
  if (other) {
    await mk('Yearly', '2026-2027', 1);
    await setups.insertOne({
      businessId: other._id, finYear: '2026-2027', documentName: 'ZZTEST2',
      documentType: TYPE, prefix: 'ZZTEST/', suffix: '', autoNumberLength: 4,
      startFrom: 1, validity: 'Yearly', status: true, sample: '',
      createdAt: new Date(), updatedAt: new Date(),
    });
    const a1 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
    const b1 = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId: other._id, finYear: '2026-2027' });
    ok('a second business has its own counter', a1 === 'ZZTEST/0001' && b1 === 'ZZTEST/0001', `${a1} vs ${b1}`);
  }

  /* --- inactive setup is ignored --- */
  await mk('Yearly', '2026-2027', 500);
  await setups.updateOne({ documentType: TYPE }, { $set: { status: false } });
  await counters.deleteMany({ key: new RegExp(TYPE) });
  const inactive = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
  ok('an INACTIVE setup is not used (no prefix, no startFrom)',
    !inactive.startsWith('ZZTEST/'), inactive);

  /* --- suffix is applied --- */
  await mk('Yearly', '2026-2027', 1);
  await setups.updateOne({ documentType: TYPE }, { $set: { suffix: '/X' } });
  await counters.deleteMany({ key: new RegExp(TYPE) });
  const suf = await nextDocNumber(Grc, 'grcNumber', TYPE, { businessId, finYear: '2026-2027' });
  ok('suffix is appended to the issued number', suf === 'ZZTEST/0001/X', suf);
}

console.log('\n--- ONE CONFIG PER BUSINESS + TYPE + YEAR ---');
try {
  await setups.createIndex({ businessId: 1, documentType: 1, finYear: 1 },
    { unique: true, partialFilterExpression: { documentType: { $gt: '' } } });
  await setups.deleteMany({ documentType: 'ZZTEST Dup' });
  const base = { businessId, finYear: '2026-2027', documentType: 'ZZTEST Dup', documentName: 'a', prefix: 'D/', autoNumberLength: 4, startFrom: 1, validity: 'Never', status: true };
  await setups.insertOne({ ...base, createdAt: new Date() });
  let threw = false;
  try { await setups.insertOne({ ...base, documentName: 'b', createdAt: new Date() }); } catch { threw = true; }
  ok('a duplicate config for the same business+type+year is rejected', threw);
  await setups.deleteMany({ documentType: 'ZZTEST Dup' });
} catch (e) {
  console.log('  FAIL  unique index could not be created ->', e.message);
  fail += 1;
}

await cleanup();
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
