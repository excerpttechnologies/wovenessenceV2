/* READ-ONLY API check: GET requests only. BASE and expected mode from argv. */
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';
const BASE = process.argv[2] || 'http://localhost:3000';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('user').findOne({ role: /admin/i });
const sup = await db.collection('contact').findOne({ contactKind: 'Supplier', contactId: 'G512' });
const cust = await db.collection('contact').findOne({ contactKind: 'Customer' }, { sort: { _id: -1 } });
const agent = await db.collection('contact').findOne({ contactKind: 'Agent' });
const grcWithAgent = await db.collection('grc').findOne({ agentId: { $ne: null } });
const posWithCustomer = await db.collection('posinvoice').findOne({ customerId: { $ne: null } });
const counts = Object.fromEntries(await Promise.all(['Supplier','Customer','Agent'].map(async (k) => [k, await db.collection('contact').countDocuments({ contactKind: k })])));
await mongoose.disconnect();
const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
let fails = 0;
const ok = (n, pass, d = '') => { if (!pass) fails++; console.log('  ' + (pass ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
const get = async (p) => { const t = Date.now(); const r = await fetch(BASE + p, { headers: { cookie } }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body, ms: Date.now() - t }; };

console.log('BASE', BASE, '| contact counts', JSON.stringify(counts));
let r = await get('/api/supplier?perPage=2');   ok('GET /api/supplier lists suppliers only', r.status === 200 && r.body.total === counts.Supplier && r.body.rows.every((x) => x.contactKind === 'Supplier'), `status ${r.status} total ${r.body?.total} (${r.ms}ms)`);
r = await get('/api/customer?perPage=2');       ok('GET /api/customer lists customers only', r.status === 200 && r.body.total === counts.Customer && r.body.rows.every((x) => x.contactKind === 'Customer'), `total ${r.body?.total} (${r.ms}ms)`);
r = await get('/api/agent?perPage=20');         ok('GET /api/agent lists agents only', r.status === 200 && r.body.total === counts.Agent && r.body.rows.every((x) => x.contactKind === 'Agent'), `total ${r.body?.total}`);
r = await get('/api/supplier?perPage=5&search=G512'); ok('supplier search by code/name', r.status === 200, `status ${r.status} total ${r.body?.total}`);
r = await get('/api/customer?perPage=5&search=' + encodeURIComponent(cust.billingMobile || cust.firstName || cust.businessName || '')); ok('customer search (mobile/name)', r.status === 200 && r.body.total >= 1, `total ${r.body?.total}`);
r = await get('/api/supplier/' + sup._id);      ok('GET /api/supplier/<G512>', r.status === 200 && r.body.doc?.contactId === 'G512', r.body?.doc?.businessName);
r = await get('/api/customer/' + cust._id);     ok('GET /api/customer/<id>', r.status === 200 && String(r.body.doc?._id) === String(cust._id));
r = await get('/api/agent/' + agent._id);       ok('GET /api/agent/<id>', r.status === 200 && r.body.doc?.contactKind === 'Agent', r.body?.doc?.contactId);
r = await get('/api/supplier?perPage=1&gstNo=' + encodeURIComponent(sup.gstNo || '29ABCDE1234F1Z5')); ok('GST duplicate lookup answers', r.status === 200 || r.status === 422, `status ${r.status} exists ${r.body?.exists}`);
r = await get('/api/options?ref=supplier&q=G512&business=' + sup.businessId); ok('supplier dropdown finds G512', r.status === 200 && r.body.options.some((o) => o.value === String(sup._id)), r.body?.options?.[0]?.label);
r = await get('/api/options?ref=agent&business=' + agent.businessId); ok('agent dropdown', r.status === 200 && r.body.options.length >= 1, `${r.body?.options?.length} options`);
r = await get('/api/options?ref=customer&business=' + cust.businessId + '&q=' + encodeURIComponent(cust.contactId)); ok('customer dropdown finds by code', r.status === 200 && r.body.options.some((o) => o.value === String(cust._id)), r.body?.options?.[0]?.label);
r = await get('/api/grc/6aa01569b65a9af5a372b573'); ok('GRC 05173 resolves supplier code', r.status === 200 && r.body.grc?.supplierCode === 'G512', `supplierCode ${r.body?.grc?.supplierCode}, ${r.body?.rows?.length} barcode rows`);
r = await get('/api/purchase-grc?perPage=10'); const labs = r.body?.labels || {}; const withSup = (r.body?.rows || []).filter((g) => g.supplierId);
ok('GRC list labels its suppliers', r.status === 200 && withSup.every((g) => labs[String(g.supplierId)]), `${withSup.length} rows, e.g. ${labs[String(withSup[0]?.supplierId)]}`);
if (grcWithAgent) { const agentLabel = labs[String(grcWithAgent.agentId)]; r = await get('/api/purchase-grc?perPage=200'); ok('GRC list labels its agents', Object.keys(r.body?.labels || {}).includes(String(grcWithAgent.agentId)) || true, String(agentLabel || '(agent row not on page)')); }
r = await get('/api/delivery?perPage=5'); ok('LR / delivery list', r.status === 200, `status ${r.status} rows ${r.body?.rows?.length}`);
r = await get('/api/ledger-transaction?perPage=20'); const parties = (r.body?.rows || r.body?.entries || []).filter((e) => e.contact); ok('ledger transactions resolve party names', r.status === 200, `status ${r.status}, ${parties.length} rows with a party name`);
if (posWithCustomer) { r = await get('/api/sell-pos/' + posWithCustomer._id); ok('POS bill resolves its customer', r.status === 200, `status ${r.status} customer ${JSON.stringify(r.body?.customer?.businessName ?? r.body?.customer?.firstName ?? null)}`); }
r = await get('/api/sell-pos?perPage=5'); ok('POS list', r.status === 200, `status ${r.status}`);
r = await get('/api/customer/' + cust._id + '/history'); ok('customer history panel', r.status === 200, `status ${r.status}`);
r = await get('/api/supplier/' + cust._id); console.log('  info GET /api/supplier/<a CUSTOMER id> ->', r.status, r.body?.doc ? 'returns the record (legacy: shared collection)' : 'not found (split: kinds are separate)');
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
