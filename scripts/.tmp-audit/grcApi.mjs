/* READ ONLY: GET the GRC barcode-generation data the page loads */
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';
await mongoose.connect(process.env.MONGODB_URI);
const user = await mongoose.connection.db.collection('user').findOne({ role: /admin/i });
await mongoose.disconnect();
const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
const BASE = process.argv[2] || 'http://localhost:3000';
for (const p of ['/api/grc/6a980a0b3cfd7c0c4dc9673f', '/admin/transaction/purchase/grc/6a980a0b3cfd7c0c4dc9673f/barcode-generation']) {
  const t = Date.now();
  const r = await fetch(BASE + p, { headers: { cookie }, redirect: 'manual' });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  console.log('=====', p, r.status, (Date.now() - t) + 'ms', text.length + ' bytes');
  if (body) {
    console.log('keys:', Object.keys(body), '| error:', body.error);
    if (body.grc) console.log('grc:', JSON.stringify({ grcNumber: body.grc.grcNumber, supplierCode: body.grc.supplierCode, lastBarcodeSeq: body.grc.lastBarcodeSeq }));
    if (body.rows) { console.log('rows:', body.rows.length); console.log('row0 keys:', Object.keys(body.rows[0] || {}).join(',')); console.log('row0:', JSON.stringify(body.rows[0]).slice(0, 900)); }
  } else console.log(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
}
