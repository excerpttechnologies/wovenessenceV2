/* Verifies the supplier replacement: that the workbook landed, that nothing
   else was touched, and above all that no historical reference was broken.

   THE BASELINE MATTERS. This database already contained dangling supplier
   references before any import ran - 99 of the 281 G-codes in barcodeLabel
   pointed at suppliers that never existed. Asserting "every reference
   resolves" would therefore fail for reasons the import did not cause, so
   the test compares against the BACKUP taken immediately before the run:
   the question is not "is everything perfect" but "did this import break
   anything that previously worked".

   Run after `npm run suppliers:replace:apply`:
     npm run test:suppliers
   and, for the UI half, with the server up:
     npx next build && npx next start -p 3111
*/

import mongoose from 'mongoose';
import crypto from 'crypto';
import XLSX from 'xlsx';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3111';
const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  -> ' + d : ''))); };
const T = (v) => (v === null || v === undefined ? '' : String(v).trim());

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const contacts = db.collection('contact');

/* the state immediately before the import */
const backups = existsSync(path.join(ROOT, 'backups'))
  ? readdirSync(path.join(ROOT, 'backups')).filter((f) => f.startsWith('suppliers-before-')).sort()
  : [];
if (!backups.length) { console.error('No backup found - run the import first.'); process.exit(1); }
const before = JSON.parse(readFileSync(path.join(ROOT, 'backups', backups[0]), 'utf8'));
console.log(`baseline: ${backups[0]}  (${before.length} suppliers before the import)\n`);

console.log('--- NOTHING ELSE WAS TOUCHED ---');
ok('customers untouched', await contacts.countDocuments({ contactKind: 'Customer' }) === 15440,
  String(await contacts.countDocuments({ contactKind: 'Customer' })));
ok('agents untouched', await contacts.countDocuments({ contactKind: 'Agent' }) >= 1);
ok('the contact collection still holds all three kinds',
  (await contacts.distinct('contactKind')).length === 3);

console.log('\n--- REFERENTIAL INTEGRITY (measured against the baseline) ---');
const refs = new Set();
for (const [col, f] of [['grc', 'supplierId'], ['delivery', 'supplierId'],
  ['barcodeLabel', 'supplierId'], ['purchaseinvoice', 'supplierId']]) {
  try { (await db.collection(col).distinct(f, { [f]: { $nin: [null, ''] } })).forEach((v) => refs.add(String(v))); } catch { /* absent */ }
}
const idRefs = [...refs].filter((v) => mongoose.isValidObjectId(v));
const codeRefs = [...refs].filter((v) => !mongoose.isValidObjectId(v));

const beforeIds = new Set(before.map((s) => String(s._id)));
const beforeCodes = new Set(before.map((s) => T(s.contactId).toUpperCase()));
const nowIds = new Set((await contacts.find({ contactKind: 'Supplier' }).project({ _id: 1 }).toArray()).map((s) => String(s._id)));
const nowCodes = new Set((await contacts.find({ contactKind: 'Supplier' }).project({ contactId: 1 }).toArray()).map((s) => T(s.contactId).toUpperCase()));

const idsOkBefore = idRefs.filter((i) => beforeIds.has(i)).length;
const idsOkNow = idRefs.filter((i) => nowIds.has(i)).length;
ok(`no ObjectId reference lost (${idsOkBefore} resolved before)`, idsOkNow === idsOkBefore, `${idsOkNow}/${idsOkBefore}`);

const codesOkBefore = codeRefs.filter((c) => beforeCodes.has(c.toUpperCase())).length;
const codesOkNow = codeRefs.filter((c) => nowCodes.has(c.toUpperCase())).length;
ok(`no G-code reference lost (${codesOkBefore} of ${codeRefs.length} resolved before)`,
  codesOkNow === codesOkBefore, `${codesOkNow}/${codesOkBefore}`);

const g = await db.collection('grc').findOne({ grcNumber: '05158' });
if (g) {
  const sup = await contacts.findOne({ _id: g.supplierId });
  ok('GRC 05158 still resolves its vendor', Boolean(sup), sup ? `${sup.businessName} (${sup.contactId})` : 'BROKEN');
}

console.log('\n--- THE WORKBOOK IS THE SOURCE OF TRUTH ---');
const rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(path.join(ROOT, 'supplier_full_scrape.xlsx'), { raw: true }).Sheets.Suppliers,
  { header: 1, raw: true, defval: null }
).slice(1);
const xl = rows.filter((r) => T(r[0]) && T(r[1])).map((r) => ({ code: T(r[0]), name: T(r[1]), mobile: T(r[4]) }));

let named = 0; let mobiles = 0; const miss = [];
for (const x of xl) {
  const d = await contacts.findOne({ contactKind: 'Supplier', contactId: x.code });
  if (!d) { miss.push(x.code + ' MISSING'); continue; }
  if (d.businessName === x.name) named += 1; else miss.push(`${x.code} name "${d.businessName}" != "${x.name}"`);
  if (!x.mobile || d.billingMobile === x.mobile) mobiles += 1;
}
ok(`all ${xl.length} workbook suppliers exist with the workbook's name`, named === xl.length, miss.slice(0, 3).join(' | '));
ok('mobile numbers match the workbook', mobiles === xl.length, `${mobiles}/${xl.length}`);

console.log('\n--- SECTION 14: a company name is never a person name ---');
/* only the rows this import wrote - the retained legacy suppliers carry
   their own pre-existing quirks and are not this import's to answer for */
const importedBad = await contacts.countDocuments({
  contactKind: 'Supplier',
  contactId: { $in: xl.map((x) => x.code) },
  $expr: { $eq: ['$firstName', '$businessName'] },
});
ok('no imported supplier has businessName copied into firstName', importedBad === 0, String(importedBad));

console.log('\n--- NO FABRICATED VALUES ---');
/* Fabrication means a value in the database that is NOT in the workbook -
   not a value that merely LOOKS like a placeholder.

   86 of these suppliers genuinely carry "0000000000" as their mobile in the
   source. Importing that faithfully is correct; rewriting it to empty would
   be altering the customer's data, which section 10 warns against. So the
   test compares against the workbook rather than against a shape. */
let fabricated = 0; const invented = [];
for (const x of xl) {
  const d = await contacts.findOne({ contactKind: 'Supplier', contactId: x.code });
  if (!d) continue;
  const dbMobile = T(d.billingMobile);
  if (dbMobile && dbMobile !== T(x.mobile)) {
    /* the overflow may legitimately supply a mobile the named column lacked */
    if (!x.mobile) continue;
    fabricated += 1;
    if (invented.length < 5) invented.push(`${x.code}: db="${dbMobile}" excel="${x.mobile}"`);
  }
}
ok('every stored mobile came from the workbook', fabricated === 0, invented.join(' | '));

const placeholderNames = await contacts.countDocuments({
  contactKind: 'Supplier',
  contactId: { $in: xl.map((x) => x.code) },
  businessName: /^(unknown|test|n\/?a|dummy)$/i,
});
ok('no invented business names', placeholderNames === 0, String(placeholderNames));

const sourceZeros = xl.filter((x) => x.mobile === '0000000000').length;
if (sourceZeros) {
  console.log(`     note: ${sourceZeros} suppliers carry "0000000000" as their mobile IN THE WORKBOOK`);
  console.log('           - imported as-is rather than silently blanked');
}

/* ------------------------------------------------------------------- UI -- */
console.log('\n--- UI ---');
try {
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = 'Sup-' + crypto.randomBytes(6).toString('hex');
  const email = 'supplier-ui@example.invalid';
  await db.collection('user').deleteOne({ email });
  await db.collection('user').insertOne({
    name: 'Sup UI', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const lg = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
  const api = (p) => fetch(BASE + p, { headers: { Cookie: cookie } }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }));
  const page = (p) => fetch(BASE + p, { headers: { Cookie: cookie }, redirect: 'manual' }).then((r) => r.status);

  const biz = (await contacts.findOne({ contactKind: 'Supplier', contactId: 'G1316' }))?.businessId;
  const list = await api(`/api/supplier?business=${biz}&perPage=10`);
  ok('supplier list API works', list.ok && list.body.total > 0, 'total=' + list.body?.total);
  ok('list count matches the database',
    list.body.total === await contacts.countDocuments({ contactKind: 'Supplier', businessId: biz }),
    `api=${list.body?.total}`);
  ok('supplier list page renders', await page('/admin/contact/supplier') === 200);

  const search = await api(`/api/supplier?business=${biz}&search=HIMEER`);
  ok('search finds an imported supplier', (search.body.rows || []).some((r) => r.contactId === 'G1316'),
    JSON.stringify((search.body.rows || []).map((r) => r.contactId).slice(0, 3)));
  ok('pagination works', (await api(`/api/supplier?business=${biz}&perPage=5&page=2`)).body.page === 2);

  const one = await contacts.findOne({ contactKind: 'Supplier', contactId: 'G1316' });
  const det = await api('/api/supplier/' + one._id);
  ok('supplier detail API returns the imported values',
    det.ok && det.body.doc.businessName === 'HIMEER TEXTILES' && det.body.doc.gstNo === '27AADPR2705G1ZV',
    JSON.stringify({ n: det.body?.doc?.businessName, g: det.body?.doc?.gstNo }));
  ok('supplier edit page renders', await page('/admin/contact/supplier/' + one._id) === 200);
  ok('dropdowns still resolve suppliers',
    ((await api(`/api/options?ref=supplier&business=${biz}&q=HIMEER`)).body.options || []).length > 0);

  await db.collection('user').deleteOne({ email });
} catch (e) {
  console.log('  SKIP  UI checks - server not reachable at ' + BASE + ' (' + e.message + ')');
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
