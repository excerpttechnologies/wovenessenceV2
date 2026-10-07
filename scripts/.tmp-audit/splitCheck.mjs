/* API check for CONTACT_STORAGE=split, against a server started in that mode.

   Part 1 is read-only. Part 2 (--crud) creates, edits and deletes ONE
   throwaway supplier, customer and agent under a business id that belongs to
   no business, marked with a unique tag, and removes anything carrying that
   tag in `finally` - from the split collections and from `contact`. */
import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';

const BASE = process.argv[2] || 'http://localhost:3100';
const CRUD = process.argv.includes('--crud');
const KINDS = [['Supplier', 'supplier'], ['Customer', 'customer'], ['Agent', 'agent']];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('user').findOne({ role: /admin/i });
const sup = await db.collection('supplier').findOne({ contactId: 'G512' });
const cust = await db.collection('customer').findOne({}, { sort: { _id: -1 } });
const agent = await db.collection('agent').findOne({});
const counts = Object.fromEntries(await Promise.all(KINDS.map(async ([k, c]) => [k, await db.collection(c).countDocuments()])));
const legacyCounts = Object.fromEntries(await Promise.all(KINDS.map(async ([k]) => [k, await db.collection('contact').countDocuments({ contactKind: k })])));

const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
let fails = 0;
const ok = (n, pass, d = '') => { if (!pass) fails++; console.log('  ' + (pass ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
const call = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, body: json };
};
const get = (p) => call('GET', p);

console.log('BASE', BASE, '| split counts', JSON.stringify(counts), '| contact counts', JSON.stringify(legacyCounts));

console.log('\n--- READ (split collections) ---');
let r = await get('/api/supplier?perPage=2'); ok('GET /api/supplier total = supplier collection', r.status === 200 && r.body.total === counts.Supplier, `total ${r.body?.total}`);
r = await get('/api/customer?perPage=2');     ok('GET /api/customer total = customer collection', r.status === 200 && r.body.total === counts.Customer, `total ${r.body?.total}`);
r = await get('/api/agent?perPage=20');       ok('GET /api/agent total = agent collection', r.status === 200 && r.body.total === counts.Agent, `total ${r.body?.total}`);
r = await get('/api/customer?perPage=5&search=' + encodeURIComponent(cust.billingMobile || cust.firstName || cust.businessName || '')); ok('customer search', r.status === 200 && r.body.total >= 1, `total ${r.body?.total}`);
r = await get('/api/supplier/' + sup._id);    ok('GET /api/supplier/<G512>', r.status === 200 && r.body.doc?.contactId === 'G512', r.body?.doc?.businessName);
r = await get('/api/customer/' + cust._id);   ok('GET /api/customer/<id>', r.status === 200 && String(r.body.doc?._id) === String(cust._id));
r = await get('/api/agent/' + agent._id);     ok('GET /api/agent/<id>', r.status === 200 && r.body.doc?.contactKind === 'Agent', r.body?.doc?.contactId);
r = await get('/api/supplier?perPage=1&gstNo=' + encodeURIComponent(sup.gstNo || '29ABCDE1234F1Z5')); ok('GST duplicate lookup answers', r.status === 200 || r.status === 422, `status ${r.status}`);
r = await get('/api/options?ref=supplier&q=G512&business=' + sup.businessId); ok('supplier dropdown finds G512', r.status === 200 && r.body.options.some((o) => o.value === String(sup._id)), r.body?.options?.[0]?.label);
r = await get('/api/options?ref=agent&business=' + agent.businessId); ok('agent dropdown', r.status === 200 && r.body.options.length >= 1, `${r.body?.options?.length} options`);
r = await get('/api/options?ref=customer&business=' + cust.businessId + '&q=' + encodeURIComponent(cust.contactId)); ok('customer dropdown finds by code', r.status === 200 && r.body.options.some((o) => o.value === String(cust._id)), r.body?.options?.[0]?.label);
r = await get('/api/grc/6aa01569b65a9af5a372b573'); ok('GRC 05173 resolves supplier code', r.status === 200 && r.body.grc?.supplierCode === 'G512', `supplierCode ${r.body?.grc?.supplierCode}, ${r.body?.rows?.length} barcode rows`);
r = await get('/api/purchase-grc?perPage=10'); const labs = r.body?.labels || {}; const withSup = (r.body?.rows || []).filter((g) => g.supplierId);
ok('GRC list labels its suppliers', r.status === 200 && withSup.length > 0 && withSup.every((g) => labs[String(g.supplierId)]), `${withSup.length} rows, e.g. ${labs[String(withSup[0]?.supplierId)]}`);
const withAgent = (r.body?.rows || []).filter((g) => g.agentId);
ok('GRC list labels its agents', withAgent.every((g) => labs[String(g.agentId)]), `${withAgent.length} rows with an agent`);
r = await get('/api/delivery?perPage=5'); ok('LR / delivery list', r.status === 200, `rows ${r.body?.rows?.length}`);
r = await get('/api/ledger-transaction?perPage=20'); ok('ledger transactions', r.status === 200, `${(r.body?.rows || []).filter((e) => e.contact).length} rows with a party name`);
r = await get('/api/sell-pos?perPage=5'); ok('POS list', r.status === 200, `status ${r.status}`);
r = await get('/api/customer/' + cust._id + '/history'); ok('customer history panel', r.status === 200, `status ${r.status}`);
for (const p of ['/api/reports/supplier-outstanding', '/api/reports/customer-outstanding', '/api/reports/supplier-bill', '/api/reports/sales-person', '/api/reports/sales-report', '/api/reports/pos-report']) {
  r = await get(p + '?fromDate=2025-04-01&toDate=2026-09-15'); ok('GET ' + p, r.status === 200, `status ${r.status}`);
}

console.log('\n--- ISOLATION (a kind cannot reach another kind) ---');
r = await get('/api/supplier/' + cust._id); ok('GET /api/supplier/<a customer id> is 404', r.status === 404, `status ${r.status}`);
r = await get('/api/customer/' + sup._id);  ok('GET /api/customer/<a supplier id> is 404', r.status === 404, `status ${r.status}`);
r = await get('/api/agent/' + sup._id);     ok('GET /api/agent/<a supplier id> is 404', r.status === 404, `status ${r.status}`);
r = await get('/api/options?ref=supplier&business=' + cust.businessId + '&q=' + encodeURIComponent(cust.contactId)); ok('supplier dropdown never offers a customer', r.status === 200 && !r.body.options.some((o) => o.value === String(cust._id)), `${r.body?.options?.length} options`);

if (CRUD) {
  console.log('\n--- CRUD (throwaway records, removed in finally) ---');
  const TAG = 'ZZSPLITTEST' + Date.now();
  const BIZ = String(new mongoose.Types.ObjectId());
  const created = {};
  try {
    /* a real Contact Type per kind, so the code follows its prefix */
    const TYPE = { Supplier: ['6a854a1740f8ec449f69cecc', 'G'], Customer: ['6a896df80507ecb893c00b82', 'JNR'], Agent: ['6a896e120507ecb893c00b87', 'AGENT'] };
    /* the next free number for a prefix, across every split collection */
    const nextFor = async (prefix) => {
      let top = 0;
      const rx = new RegExp('^' + prefix + '\\d+$');
      for (const c of ['supplier', 'customer', 'agent']) {
        for (const d of await db.collection(c).find({ contactId: rx }, { projection: { contactId: 1 } }).toArray()) top = Math.max(top, Number(d.contactId.slice(prefix.length)));
      }
      return prefix + (top + 1);
    };

    for (const [kind, coll] of KINDS) {
      const slug = coll;
      const [typeId, prefix] = TYPE[kind];
      const expectedCode = await nextFor(prefix);
      /* agents have no business name on their form - they are named by person */
      const NAME = kind === 'Agent' ? 'firstName' : 'businessName';
      const data = { typeId, businessType: 'Un-Registered', priceList: 'ON RSP', openingBalance: 0, firstName: 'Split', lastName: 'Test', billingMobile: '9000000000', [NAME]: `${TAG} ${kind}` };
      r = await call('POST', `/api/${slug}`, { data, business: BIZ });
      const id = r.body?.id;
      ok(`${kind}: create`, r.status === 200 && Boolean(id), `status ${r.status} ${JSON.stringify(r.body?.errors || '')}`);
      if (!id) continue;
      created[kind] = id;
      const _id = new mongoose.Types.ObjectId(id);
      const stored = await db.collection(coll).findOne({ _id });
      ok(`${kind}: stored in \`${coll}\` with contactKind ${kind}`, stored?.contactKind === kind, String(stored?.contactKind));
      ok(`${kind}: contact code continues its prefix's sequence`, stored?.contactId === expectedCode, `${stored?.contactId} (expected ${expectedCode})`);
      const elsewhere = [];
      for (const c of ['contact', ...KINDS.map(([, x]) => x).filter((x) => x !== coll)]) if (await db.collection(c).countDocuments({ _id })) elsewhere.push(c);
      ok(`${kind}: not written to \`contact\` or another kind`, elsewhere.length === 0, elsewhere.join(', '));

      r = await get(`/api/${slug}/${id}`); ok(`${kind}: view details`, r.status === 200 && r.body.doc?.[NAME] === data[NAME]);
      r = await get(`/api/${slug}?perPage=5&business=${BIZ}&search=${TAG}`); ok(`${kind}: search`, r.status === 200 && r.body.total === 1, `total ${r.body?.total}`);
      r = await get(`/api/options?ref=${slug}&business=${BIZ}&q=${TAG}`); ok(`${kind}: dropdown`, r.status === 200 && r.body.options.some((o) => o.value === id), r.body?.options?.[0]?.label);
      r = await call('PUT', `/api/${slug}/${id}`, { data: { ...data, [NAME]: `${TAG} ${kind} EDITED` }, business: BIZ });
      const edited = await db.collection(coll).findOne({ _id });
      ok(`${kind}: edit`, r.status === 200 && edited?.[NAME] === `${TAG} ${kind} EDITED` && String(edited?.businessId) === BIZ && edited?.contactId === stored.contactId, `status ${r.status}`);
    }

    if (created.Supplier) {
      r = await call('DELETE', `/api/customer/${created.Supplier}`);
      ok('DELETE /api/customer/<a supplier id> leaves the supplier alone', await db.collection('supplier').countDocuments({ _id: new mongoose.Types.ObjectId(created.Supplier) }) === 1, `status ${r.status}`);
    }
    for (const [kind, coll] of KINDS) {
      if (!created[kind]) continue;
      r = await call('DELETE', `/api/${coll}/${created[kind]}`);
      ok(`${kind}: delete`, r.status === 200 && await db.collection(coll).countDocuments({ _id: new mongoose.Types.ObjectId(created[kind]) }) === 0, `status ${r.status}`);
    }
  } finally {
    const rx = new RegExp('^' + TAG);
    let left = 0;
    for (const c of ['supplier', 'customer', 'agent', 'contact']) left += (await db.collection(c).deleteMany({ $or: [{ businessName: rx }, { firstName: rx }] })).deletedCount;
    console.log(`  cleanup: ${left} leftover test record(s) removed`);
  }
}

await mongoose.disconnect();
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
process.exit(fails ? 1 : 0);
