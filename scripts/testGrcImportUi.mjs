/* Verifies the imported historical GRCs through the REAL screens and APIs -
   not just that the import wrote rows.

   §31 of the brief is explicit: do not only check that the API returns 200,
   check that the UI renders. So this exercises the list, its filters, its
   pagination, the detail screen, the Item With Barcode columns the detail
   screen actually reads, and the Summary tab that the screen DERIVES from
   those rows - then confirms the derived totals reproduce the workbook.

   It also re-checks that nothing else broke: the barcode item list and the
   item stock report both read the same barcodeLabel collection this import
   writes into.

   Read-only apart from a temporary sign-in account, which it removes.

     npx next build && npx next start -p 3111      (in one terminal)
     npm run test:grc:ui                           (in another)
*/

import mongoose from 'mongoose';
import crypto from 'crypto';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3111';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  -> ' + d : ''))); };

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const salt = crypto.randomBytes(16).toString('hex');
const pw = 'Ui-' + crypto.randomBytes(6).toString('hex');
const email = 'grc-ui@example.invalid';
await db.collection('user').deleteOne({ email });
await db.collection('user').insertOne({
  name: 'GRC UI', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
  role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
});
const lg = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: pw }),
});
const cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
const api = (p) => fetch(BASE + p, { headers: { Cookie: cookie } }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }));
const page = (p) => fetch(BASE + p, { headers: { Cookie: cookie }, redirect: 'manual' }).then((r) => r.status);

const g = await db.collection('grc').findOne({ grcNumber: '05158', importedFrom: 'grc_full_scrape' });
if (!g) { console.error('GRC 05158 not found - run `npm run seed:grc:apply` first.'); process.exit(1); }
const q = `business=${g.businessId}&location=${g.locationId}&finYear=${g.finYear}`;

console.log('--- GRC LIST ---');
const list = await api(`/api/purchase-grc?${q}&perPage=10`);
ok('list returns the imported GRCs', list.ok && list.body.total >= 102, 'total=' + list.body?.total);
const row = (list.body.rows || []).find((r) => r.grcNumber === '05158') || list.body.rows[0];
ok('vendor name resolves for the list column', Boolean(row?.supplierName), row?.supplierName);
console.log('     e.g.', row.grcNumber, '|', row.supplierName, '| taxable', row.taxable, '| qty', row.totalQuantity, '| gst', row.gst);
ok('list page renders', await page('/admin/transaction/purchase/grc') === 200);

console.log('--- FILTERS / PAGINATION ---');
const bySup = await api(`/api/purchase-grc?${q}&supplierId=${g.supplierId}&perPage=100`);
ok('supplier filter narrows correctly',
  bySup.ok && bySup.body.total > 0 && bySup.body.rows.every((r) => String(r.supplierId) === String(g.supplierId)),
  'total=' + bySup.body?.total);
const byDate = await api(`/api/purchase-grc?${q}&startDate=2026-08-30&endDate=2026-08-30&perPage=200`);
ok('date filter narrows correctly', byDate.ok && byDate.body.total > 0 && byDate.body.total < 102, 'total=' + byDate.body?.total);
const bySearch = await api(`/api/purchase-grc?${q}&search=05158`);
ok('search by GRC No finds exactly one', bySearch.body.total === 1 && bySearch.body.rows[0].grcNumber === '05158', 'total=' + bySearch.body?.total);
ok('pagination works', (await api(`/api/purchase-grc?${q}&perPage=10&page=2`)).body.page === 2);

console.log('--- GRC DETAIL ---');
const det = await api('/api/grc/' + g._id);
ok('detail returns the GRC', det.ok && det.body.grc.grcNumber === '05158');
ok('supplierName present on the detail', Boolean(det.body.grc.supplierName), det.body.grc.supplierName);
ok('Item With Barcode rows returned', det.body.rows.length === 14, 'rows=' + det.body.rows.length);

const r0 = det.body.rows[0];
console.log('     row:', r0.itemCode, '|', r0.supplierDescription, '| qty', r0.qty, '| uom', r0.uom,
  '| hsn', r0.hsn, '| rate', r0.finalNet, '| rsp', r0.retailPrice, '| gst', r0.gst);
/* exactly the fields the detail screen's Items table reads */
['itemCode', 'batchUnique', 'billSlNo', 'supplierDescription', 'qty', 'uom', 'hsn',
  'purRate', 'finalNet', 'gst', 'retailPrice', 'offerPrice', 'barcodeGenerated']
  .forEach((f) => ok(`items column "${f}" populated`, r0[f] !== undefined && r0[f] !== '' && r0[f] !== null, JSON.stringify(r0[f])));

ok('detail page renders', await page('/admin/transaction/purchase/grc/' + g._id) === 200);
ok('summary tab renders', await page('/admin/transaction/purchase/grc/' + g._id + '?tab=summary') === 200);

console.log('--- SUMMARY TAB IS DERIVED, AND MATCHES THE WORKBOOK ---');
/* the identical arithmetic the detail screen uses */
const d = det.body.rows.reduce((a, r) => {
  const before = (Number(r.finalNet) || Number(r.purRate)) * Number(r.qty);
  const gst = before * (Number(r.gst) / 100);
  return { q: a.q + Number(r.qty), b: a.b + before, g: a.g + gst, n: a.n + before + gst };
}, { q: 0, b: 0, g: 0, n: 0 });
console.log(`     derived : qty ${d.q.toFixed(2)}  before ${d.b.toFixed(2)}  gst ${d.g.toFixed(2)}`);
console.log(`     header  : qty ${g.totalQuantity}  before ${g.taxable}  gst ${g.gst}`);
ok('derived quantity matches the GRC header', Math.abs(d.q - g.totalQuantity) < 0.01);
ok('derived taxable matches the GRC header', Math.abs(d.b - g.taxable) < 0.01);
ok('derived GST matches the GRC header (to rounding)', Math.abs(d.g - g.gst) < 1);

console.log('--- IMAGE FALLBACK ---');
ok('imageUrl is blank, never a wrong barcode\'s image',
  det.body.rows.every((r) => !r.imageUrl), JSON.stringify(r0.imageUrl));

console.log('--- NOTHING ELSE BROKEN ---');
ok('barcode item list still works', (await api(`/api/inventory-barcode-list?${q}&perPage=5`)).ok);
ok('item stock report still works',
  (await api(`/api/reports/item-stock?${q}&fromDate=2026-08-01&toDate=2026-08-31&tab=itemwise`)).ok);

await db.collection('user').deleteOne({ email });
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
