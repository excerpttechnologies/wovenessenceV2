/* READ-ONLY: every GET API route, on the legacy server (contact) and the
   split server (supplier / customer / agent). GET requests only.

   Skipped: auth/[action] (session), files/[...path] (file serving),
   pincode (its GET caches an external lookup), gst (calls the GST portal).
   [id] segments get a real id from the parent list route's first row. */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';

const LEGACY = process.argv[2] || 'http://localhost:3000';
const SPLIT = process.argv[3] || 'http://localhost:3100';
const SKIP = [/^\/api\/auth\//, /^\/api\/files\//, /^\/api\/pincode/, /^\/api\/gst/];
const Q = 'perPage=5&fromDate=2025-04-01&toDate=2026-09-15';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('user').findOne({ role: /admin/i });
const barcode = await db.collection('barcodeLabel').findOne({ supplierId: { $nin: [null, ''] } }, { sort: { _id: -1 } });
await mongoose.disconnect();
const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name === 'route.js' ? [p] : [];
});
const routes = walk('app/api')
  .filter((f) => /export\s+(async\s+)?function\s+GET|export\s+const\s+GET/.test(fs.readFileSync(f, 'utf8')))
  .map((f) => '/' + path.dirname(f).split(path.sep).join('/').replace(/^app\//, ''))
  .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
async function hit(base, p) {
  const t = Date.now();
  try {
    const r = await fetch(base + p, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(180000) });
    const text = await r.text();
    let body = null; try { body = JSON.parse(text); } catch {}
    const norm = body ? JSON.stringify(sortKeys(body)) : text.replace(/\s+/g, ' ');
    return { status: r.status, body, norm, ms: Date.now() - t, type: r.headers.get('content-type') || '' };
  } catch (e) { return { status: 0, body: null, norm: String(e), ms: Date.now() - t, type: '' }; }
}
const firstId = (b) => {
  const arr = Array.isArray(b) ? b : b?.rows || b?.data || b?.items || b?.docs || b?.list || b?.options || null;
  const row = Array.isArray(arr) ? arr.find((x) => x && (x._id || x.value)) : null;
  return row ? String(row._id || row.value) : null;
};

const idCache = new Map();
const result = { ok: 0, clientErr: 0, fail: 0, skipped: 0, noSample: 0, diff: 0 };
const lines = [];
for (const route of routes) {
  if (SKIP.some((rx) => rx.test(route))) { result.skipped++; lines.push(`SKIP                       ${route}`); continue; }
  let url = route;
  if (url.includes('[code]')) url = url.replace('[code]', encodeURIComponent(barcode.barcodeNo));
  if (url.includes('[id]')) {
    const parent = url.slice(0, url.indexOf('/[id]'));
    if (!idCache.has(parent)) idCache.set(parent, firstId((await hit(LEGACY, parent + '?' + Q)).body));
    const id = idCache.get(parent);
    if (!id) { result.noSample++; lines.push(`NO-SAMPLE                  ${route}   (parent list returned no rows)`); continue; }
    url = url.replace('[id]', id);
  }
  const p = url + '?' + Q;
  const [a, b] = await Promise.all([hit(LEGACY, p), hit(SPLIT, p)]);
  const same = a.status === b.status && a.norm === b.norm;
  if (!same) result.diff++;
  const worst = Math.max(a.status || 999, b.status || 999);
  let tag;
  if (a.status >= 200 && a.status < 400 && b.status >= 200 && b.status < 400) { tag = 'OK'; result.ok++; }
  else if (a.status >= 400 && a.status < 500 && b.status >= 400 && b.status < 500) { tag = 'NEEDS-PARAM'; result.clientErr++; }
  else { tag = 'FAIL'; result.fail++; }
  const rows = Array.isArray(a.body?.rows) ? ` rows ${a.body.rows.length}${a.body.total != null ? '/' + a.body.total : ''}` : '';
  const msg = tag !== 'OK' ? '  msg: ' + JSON.stringify(a.body?.error || a.body?.errors || a.body?.message || a.norm.slice(0, 160)).slice(0, 200) : '';
  lines.push(`${tag.padEnd(11)} ${String(a.status).padStart(3)}/${String(b.status).padEnd(3)} ${same ? 'same' : 'DIFF'}  ${route}${rows}  (${a.ms}ms)${msg}`
    + (same ? '' : `\n              legacy: ${a.norm.slice(0, 200)}\n              split : ${b.norm.slice(0, 200)}`));
  void worst;
}
console.log(lines.join('\n'));
console.log('\nroutes with GET: ' + routes.length + ' | ' + JSON.stringify(result));
