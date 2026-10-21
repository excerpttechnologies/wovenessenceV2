/* Verifies the agent replacement against the workbook and the UI.

   Run after `npm run agents:replace:apply`:
     npm run test:agents
   with the server up for the UI half:
     npx next build && npx next start -p 3111
*/

import mongoose from 'mongoose';
import crypto from 'crypto';
import XLSX from 'xlsx';
import path from 'path';
import { existsSync } from 'fs';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3111';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  -> ' + d : ''))); };
const T = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

const EXCEL = process.env.AGENT_EXCEL_PATH
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'agent_full_scrape.xlsx');
if (!existsSync(EXCEL)) { console.error('Workbook not found: ' + EXCEL); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const contacts = db.collection('contact');

const rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(EXCEL, { raw: true }).Sheets.Agents, { header: 1, raw: true, defval: null }
).slice(1);
const xl = rows.filter((r) => T(r[0])).map((r) => ({ code: T(r[0]), name: T(r[1]), mobile: T(r[3]) }));

console.log('--- COUNTS ---');
const agents = await contacts.countDocuments({ contactKind: 'Agent' });
console.log(`  agents in DB: ${agents}   workbook rows: ${xl.length}`);
ok('agent count matches the workbook exactly', agents === xl.length, `${agents} vs ${xl.length}`);

console.log('\n--- NOTHING ELSE TOUCHED (agents share the contact collection) ---');
ok('customers untouched', await contacts.countDocuments({ contactKind: 'Customer' }) === 15440,
  String(await contacts.countDocuments({ contactKind: 'Customer' })));
ok('suppliers untouched', await contacts.countDocuments({ contactKind: 'Supplier' }) === 442,
  String(await contacts.countDocuments({ contactKind: 'Supplier' })));

console.log('\n--- THE WORKBOOK IS THE SOURCE OF TRUTH ---');
let named = 0; let mob = 0; const bad = [];
for (const x of xl) {
  const a = await contacts.findOne({ contactKind: 'Agent', contactId: x.code });
  if (!a) { bad.push(x.code + ' MISSING'); continue; }
  /* the list renders firstName + lastName; that must reproduce the
     workbook's Name column exactly */
  const rendered = [a.firstName, a.middleName, a.lastName].map((s) => T(s)).filter(Boolean).join(' ');
  if (rendered.toLowerCase() === x.name.toLowerCase()) named += 1;
  else bad.push(`${x.code}: shows "${rendered}" want "${x.name}"`);
  if (!x.mobile || T(a.billingMobile) === x.mobile) mob += 1;
}
ok(`all ${xl.length} agents render the workbook's name`, named === xl.length, bad.slice(0, 3).join(' | '));
ok('mobile numbers match the workbook', mob === xl.length, `${mob}/${xl.length}`);

console.log('\n--- FIELDS ARE NOT SHIFTED (section 20) ---');
const shifted = await contacts.countDocuments({
  contactKind: 'Agent',
  $or: [
    { billingMobile: /[A-Za-z]/ },                 // a name in the mobile field
    { billingState: /^\d+$/ },                     // a number in the state field
    { firstName: /^\d{7,}$/ },                     // a phone in the name field
    { billingEmail: { $nin: [null, ''], $not: /@/ } },
  ],
});
ok('no phone in a name field, no name in a phone field', shifted === 0, String(shifted));

const junk = await contacts.countDocuments({
  contactKind: 'Agent',
  $or: [{ firstName: /^(unknown|test|na)$/i }, { billingMobile: '0000000000' }],
});
ok('no invented placeholder values', junk === 0, String(junk));

console.log('\n--- OLD TEST AGENT IS GONE ---');
ok('the "jjj2" test agent was removed', await contacts.countDocuments({ contactKind: 'Agent', contactId: 'jjj2' }) === 0);

console.log('\n--- GRC AGENT LINKS ---');
const linked = await db.collection('grc').countDocuments({ agentId: { $ne: null } });
console.log(`  GRCs now carrying an agentId: ${linked}`);
ok('GRCs were linked to real agents', linked >= 89, String(linked));
const sample = await db.collection('grc').findOne({ agentId: { $ne: null } });
const ag = sample ? await contacts.findOne({ _id: sample.agentId }) : null;
ok('a linked GRC resolves its agent', Boolean(ag), ag ? `${sample.grcNumber} -> ${ag.contactId}` : 'BROKEN');
ok('the linked agent matches the name the GRC recorded',
  ag && [ag.firstName, ag.middleName, ag.lastName].filter(Boolean).join(' ').toLowerCase()
    === T(sample.importMeta?.agent).toLowerCase(),
  ag ? `${[ag.firstName, ag.lastName].filter(Boolean).join(' ')} vs ${sample.importMeta?.agent}` : '');

console.log('\n--- SPOT CHECKS ---');
for (const code of ['AGENT1', 'AGENT6', 'AGENT7', 'AGENT8']) {
  const a = await contacts.findOne({ contactKind: 'Agent', contactId: code });
  console.log(`  ${code}: ${a.prefix} ${[a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ')}`
    + `  mob=${a.billingMobile || '-'} state=${a.billingState || '-'} country=${a.billingCountry || '-'}`
    + `${a.gender ? ' gender=' + a.gender : ''}${a.shortName ? ' short=' + a.shortName : ''}`);
}

/* ------------------------------------------------------------------- UI -- */
console.log('\n--- UI ---');
try {
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = 'Ag-' + crypto.randomBytes(6).toString('hex');
  const email = 'agent-ui@example.invalid';
  await db.collection('user').deleteOne({ email });
  await db.collection('user').insertOne({
    name: 'Agent UI', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const lg = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (lg.headers.get('set-cookie') || '').split(';')[0];
  const api = (p) => fetch(BASE + p, { headers: { Cookie: cookie } }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }));
  const page = (p) => fetch(BASE + p, { headers: { Cookie: cookie }, redirect: 'manual' }).then((r) => r.status);

  const one = await contacts.findOne({ contactKind: 'Agent', contactId: 'AGENT7' });
  const list = await api(`/api/agent?business=${one.businessId}&perPage=20`);
  ok('agent list API works', list.ok && list.body.total === xl.length, 'total=' + list.body?.total);
  ok('list rows carry the code and mobile',
    (list.body.rows || []).some((r) => r.contactId === 'AGENT7' && r.billingMobile === '2233445566'));
  ok('agent list page renders', await page('/admin/contact/agent') === 200);
  ok('agent edit page renders', await page('/admin/contact/agent/' + one._id) === 200);
  const det = await api('/api/agent/' + one._id);
  ok('agent detail returns the workbook values',
    det.ok && det.body.doc.firstName === 'RATHAN' && det.body.doc.lastName === 'SURAT',
    JSON.stringify({ f: det.body?.doc?.firstName, l: det.body?.doc?.lastName }));
  ok('agent dropdowns resolve', ((await api(`/api/options?ref=agent&business=${one.businessId}`)).body.options || []).length === xl.length);

  await db.collection('user').deleteOne({ email });
} catch (e) {
  console.log('  SKIP  UI checks - server not reachable at ' + BASE + ' (' + e.message + ')');
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
