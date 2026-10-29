/* TEMPORARY verification - deleted after the run.
   Proves the save route keeps billSlNo separate from the barcode's running
   serial when the client no longer sends a serialNo (the fixed form). */
import mongoose from 'mongoose';
import crypto from 'crypto';
import { contactCollection } from '@/lib/contactStorage';

const BASE = process.env.E2E_BASE || 'http://localhost:3001';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
const business = new ObjectId();
const location = new ObjectId();
const finYear = '2026-2027';
const prefix = 'Q' + hex.slice(0, 2);
const supplierId = new ObjectId();
const supplierCode = 'GSQ' + hex;
const itemCode = 'QIT' + hex;
const email = `tmp-map-${hex.toLowerCase()}@example.invalid`;
const pw = 'Tmp-map-pass';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};

const now = new Date();
try {
  await db.collection(contactCollection('Supplier')).insertOne({
    _id: supplierId, contactId: supplierCode, businessName: 'TMP MAP SUP', contactKind: 'Supplier',
    businessId: business, createdAt: now, updatedAt: now,
  });
  await db.collection('barcodesetting').insertOne({
    businessId: business, finYear, type: 'Periodic', subType: 'Yearly', periodIndex: 1, periodLabel: 'YEARLY 1',
    prefix, suffix: '', startNumber: 1, numberLenght: 4,
    effectiveDate: new Date('2026-04-01'), expiryDate: new Date('2027-03-31'), createdAt: now, updatedAt: now,
  });
  await db.collection('item').insertOne({
    _id: new ObjectId(), businessId: business, itemCode, name: itemCode + ' NAME', createdAt: now, updatedAt: now,
  });
  const salt = crypto.randomBytes(16).toString('hex');
  await db.collection('user').insertOne({
    name: 'TMP MAP', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: now, updatedAt: now,
  });

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  ok('signed in', Boolean(cookie), 'HTTP ' + login.status);
  const api = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } })
    .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

  /* NO serialNo: that is exactly what the fixed form sends now. */
  const row = (id) => ({
    id, itemCode, itemName: 'TMP ITEM', p_m_f: 'P-M-F', hsn: '520811', gst: '5', uom: 'PC',
    qty: '1', purchaseRate: '95', finalPrice: '95', retailPrice: '150', discountType: 'Percentage',
    discount: '0', mode: 'unique', uniqueBarcode: 'Yes', billSlNo: '1',
    supplierDescription: 'supplier text', printDescription: 'print text',
  });
  const scope = { deleteIds: [], supplierId: String(supplierId), business: String(business), location: String(location), finYear };

  const r1 = await api('/api/barcode-generation', {
    method: 'POST', body: JSON.stringify({ rows: [row('r1'), row('r2'), row('r3')], grcId: null, totals: { count: 3, value: 0 }, ...scope }),
  });
  ok('POST new GRC answers 200', r1.ok, JSON.stringify(r1.body).slice(0, 300));
  const grcId = r1.body?.grcId;
  const gno = r1.body?.grcNumber;
  const units = await db.collection('barcodeLabel').find({ grcId }).sort({ createdAt: 1, _id: 1 }).toArray();
  ok('three barcodes saved', units.length === 3, String(units.length));
  ok('all three keep BILL SL NO 1', units.every((u) => u.billSlNo === '1'), units.map((u) => u.billSlNo).join(','));
  ok('save route numbers the sequence 1,2,3', JSON.stringify(units.map((u) => u.serialNo)) === JSON.stringify(['1', '2', '3']), units.map((u) => u.serialNo).join(','));
  ok('values are SUPPLIER * GRC * 1 * SERIAL', units.every((u, i) => u.barcodeGenerated === `${supplierCode} * ${gno} * 1 * ${i + 1}`), units.map((u) => u.barcodeGenerated).join(' | '));

  const r2 = await api('/api/barcode-generation', {
    method: 'POST', body: JSON.stringify({ rows: [row('r4'), row('r5')], grcId, totals: { count: 2, value: 0 }, ...scope }),
  });
  ok('second save answers 200', r2.ok, JSON.stringify(r2.body).slice(0, 300));
  const after = await db.collection('barcodeLabel').find({ grcId }).sort({ createdAt: 1, _id: 1 }).toArray();
  ok('five barcodes, bill line still 1, sequence continues 1..5',
    after.length === 5
    && after.every((u) => u.billSlNo === '1')
    && JSON.stringify(after.map((u) => u.serialNo)) === JSON.stringify(['1', '2', '3', '4', '5']),
    after.map((u) => `${u.billSlNo}:${u.serialNo}`).join(' '));

  const grc = await db.collection('grc').findOne({ _id: new ObjectId(grcId) });
  ok('GRC serial floor for bill line 1 is 5', grc?.lastSerialByBill?.b1 === 5, JSON.stringify(grc?.lastSerialByBill));
} finally {
  await Promise.all([
    db.collection('barcodeLabel').deleteMany({ businessId: String(business) }),
    db.collection('stockmovement').deleteMany({ businessId: String(business) }),
    db.collection('grc').deleteMany({ businessId: business }),
    db.collection(contactCollection('Supplier')).deleteMany({ _id: supplierId }),
    db.collection('barcodesetting').deleteMany({ businessId: business }),
    db.collection('item').deleteMany({ businessId: business }),
    db.collection('counter').deleteMany({ key: { $regex: String(business) } }),
    db.collection('user').deleteOne({ email }),
  ]);
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed (throwaway scope removed)`);
  if (fail) process.exitCode = 1;
}
