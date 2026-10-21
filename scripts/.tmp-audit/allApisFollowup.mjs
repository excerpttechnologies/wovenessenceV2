/* READ-ONLY follow-up to allApis.mjs: the routes it could not test fully -
   detail routes whose list gave no sample id (ids taken from the database),
   and routes that need an input (given a real one). GET only, both servers. */
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';

const LEGACY = 'http://localhost:3000';
const SPLIT = 'http://localhost:3100';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('user').findOne({ role: /admin/i });
const one = async (c, q = {}) => db.collection(c).findOne(q, { sort: { _id: -1 } });
const detail = {
  '/api/barcodeitem/[id]': await one('barcodeitem'),
  '/api/delivery-challan/[id]': await one('deliverychallan'),
  '/api/grc/[id]': await one('grc'),
  '/api/payment-method/[id]': await one('paymentmethod'),
  '/api/pos-hold/[id]': await one('poshold'),
  '/api/sales-term/[id]': await one('salesterm'),
  '/api/sell-b2binvoice/[id]': await one('b2binvoice'),
  '/api/sell-creditnote/[id]': await one('creditnote'),
  '/api/stock-transfer/[id]': await one('stocktransfer'),
  '/api/stock-transfer/[id]/bill': await one('stocktransfer'),
  '/api/voucher/[id]': await one('voucher'),
};
const bc = await one('barcodeLabel', { supplierId: { $nin: [null, ''] } });
const pos = await one('posinvoice');
const stl = await one('stocktransferlocation');
const voucherTypes = (await db.collection('voucher').distinct('type'));
const legacySupplierIds = new Set((await db.collection('contact').find({ contactKind: 'Supplier' }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
const splitSupplierIds = new Set((await db.collection('supplier').find({}, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
const extra = (await db.collection('supplier').find({ _id: { $in: [...splitSupplierIds].filter((id) => !legacySupplierIds.has(id)).map((id) => new mongoose.Types.ObjectId(id)) } }).project({ contactId: 1, businessId: 1 }).toArray());
await mongoose.disconnect();

const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const hit = async (base, p) => {
  const r = await fetch(base + p, { headers: { cookie }, signal: AbortSignal.timeout(180000) });
  const t = await r.text(); let body = null; try { body = JSON.parse(t); } catch {}
  return { status: r.status, body, norm: body ? JSON.stringify(sortKeys(body)) : t };
};
let bad = 0;
const check = async (label, p) => {
  const [a, b] = await Promise.all([hit(LEGACY, p), hit(SPLIT, p)]);
  const same = a.status === b.status && a.norm === b.norm;
  const good = a.status < 400 && b.status < 400;
  if (!same || !good) bad++;
  const msg = good ? '' : '  msg: ' + JSON.stringify(a.body?.error || a.body?.errors || a.norm.slice(0, 120)).slice(0, 160);
  console.log(`  ${good ? 'OK  ' : 'FAIL'} ${a.status}/${b.status} ${same ? 'same' : 'DIFF'}  ${label}  ${a.norm.length} bytes${msg}`);
};

console.log('--- detail routes, id from the database ---');
for (const [route, doc] of Object.entries(detail)) {
  if (!doc) { console.log(`  EMPTY          ${route}  (collection holds no documents - nothing to open)`); continue; }
  await check(route, route.replace('[id]', String(doc._id)));
}
console.log('\n--- routes that need an input ---');
for (const t of voucherTypes) await check(`/api/voucher?type=${t}`, `/api/voucher?type=${encodeURIComponent(t)}&perPage=20`);
await check('/api/reports/barcode-report?itemCode=' + bc.itemCode, `/api/reports/barcode-report?itemCode=${encodeURIComponent(bc.itemCode)}&fromDate=2025-04-01&toDate=2026-09-15`);
await check('/api/sell-pos-return/lookup?invoice=' + pos.invoiceNo, `/api/sell-pos-return/lookup?invoice=${encodeURIComponent(pos.invoiceNo)}&business=${pos.businessId}`);
await check('/api/sell-pos-return/lookup?barcode=' + bc.barcodeNo, `/api/sell-pos-return/lookup?barcode=${encodeURIComponent(bc.barcodeNo)}&business=${bc.businessId || bc.currentBusinessId}`);
if (stl) await check('/api/stock-transfer-delivery-challan?stockTransferLocationId=...', `/api/stock-transfer-delivery-challan?stockTransferLocationId=${stl._id}`);
await check('/api/ic-delivery-challan/item-lookup?code=' + bc.barcodeNo, `/api/ic-delivery-challan/item-lookup?code=${encodeURIComponent(bc.barcodeNo)}&business=${bc.currentBusinessId || bc.businessId}&location=${bc.currentLocationId || bc.locationId || ''}`);
await check('/api/stock-transfer-packet/item-lookup?code=' + bc.barcodeNo, `/api/stock-transfer-packet/item-lookup?code=${encodeURIComponent(bc.barcodeNo)}&business=${bc.currentBusinessId || bc.businessId}&fromLocation=${bc.currentLocationId || bc.locationId || ''}`);

console.log('\n--- the one list that differed: /api/supplier ---');
console.log(`  contact suppliers ${legacySupplierIds.size} | supplier collection ${splitSupplierIds.size} | only in supplier: ${extra.length} -> ${extra.map((d) => d.contactId || '(no code)').join(', ')} (business ${[...new Set(extra.map((d) => String(d.businessId)))].join(', ')})`);
console.log(`  every contact supplier is in the supplier collection: ${[...legacySupplierIds].every((id) => splitSupplierIds.has(id))}`);
await check('/api/supplier, real business only', '/api/supplier?perPage=500&business=6a853cdefb266c4358beb548');

console.log(bad ? `\n${bad} NOT OK` : '\nALL OK');
