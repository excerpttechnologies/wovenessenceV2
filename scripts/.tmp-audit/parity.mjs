/* READ-ONLY: the same GET on the legacy server (contact) and the split server
   (supplier / customer / agent) must return the same JSON. */
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';

const LEGACY = process.argv[2] || 'http://localhost:3000';
const SPLIT = process.argv[3] || 'http://localhost:3100';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('user').findOne({ role: /admin/i });
const sup = await db.collection('contact').findOne({ contactKind: 'Supplier', contactId: 'G512' });
const grcs = await db.collection('grc').find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(5).toArray();
const pos = await db.collection('posinvoice').find({ customerId: { $ne: null } }, { projection: { _id: 1 } }).limit(3).toArray();
const barcodes = await db.collection('barcodeLabel').find({ supplierId: { $nin: [null, ''] } }, { projection: { barcodeNo: 1 } }).sort({ _id: -1 }).limit(3).toArray();
await mongoose.disconnect();

const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
const D = 'fromDate=2025-04-01&toDate=2026-09-15';
const paths = [
  `/api/reports/supplier-outstanding?${D}`, `/api/reports/customer-outstanding?${D}`, `/api/reports/supplier-bill?${D}`,
  `/api/reports/sales-person?${D}`, `/api/reports/sales-report?${D}`, `/api/reports/pos-report?${D}`,
  '/api/ledger-transaction?perPage=500', '/api/purchase-grc?perPage=200', '/api/delivery?perPage=100', '/api/sell-pos?perPage=100',
  `/api/supplier?perPage=50&business=${sup.businessId}&search=TEX`, `/api/options?ref=supplier&business=${sup.businessId}`,
  `/api/options?ref=agent&business=${sup.businessId}`,
  ...grcs.map((g) => `/api/grc/${g._id}`), ...pos.map((p) => `/api/sell-pos/${p._id}`),
  ...barcodes.map((b) => `/api/barcode/${encodeURIComponent(b.barcodeNo)}`),
];

const fetchJson = async (base, p) => {
  const r = await fetch(base + p, { headers: { cookie } });
  const t = await r.text();
  /* key order carries no meaning in a JSON object (labels are resolved per
     kind in parallel), so objects are compared with their keys sorted */
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  let text = t;
  try { text = JSON.stringify(sortKeys(JSON.parse(t))); } catch {}
  return { status: r.status, text: text.replace(/"(ms|elapsed|generatedAt|now)":[^,}]+/g, '') };
};
let diffs = 0;
for (const p of paths) {
  const [a, b] = await Promise.all([fetchJson(LEGACY, p), fetchJson(SPLIT, p)]);
  const same = a.status === b.status && a.text === b.text;
  if (!same) diffs++;
  let where = '';
  if (!same) { let i = 0; while (i < a.text.length && a.text[i] === b.text[i]) i++; where = `  first difference at ${i}: legacy ${JSON.stringify(a.text.slice(Math.max(0, i - 60), i + 80))} | split ${JSON.stringify(b.text.slice(Math.max(0, i - 60), i + 80))}`; }
  console.log(`  ${same ? 'same' : 'DIFF'}  ${a.status}/${b.status}  ${String(a.text.length).padStart(7)} bytes  ${p}${where}`);
}
console.log(diffs ? `\n${diffs} DIFFERENT` : '\nALL IDENTICAL');
process.exit(diffs ? 1 : 0);
