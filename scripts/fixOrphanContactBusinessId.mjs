/* One-time repair: contacts stamped with a businessId that no longer exists.

   Symptom this fixes
   ------------------
   /admin/contact/agent listed its 8 agents and then went to "No Data..".
   The list request that runs before the Business selector resolves carries
   `business=`, which /api/agent reads as "no business filter" - so every
   agent came back. The properly scoped request that followed asked for
   TEMPLE FABRICS and got nothing, because all 8 agents carry

       businessId: 6a847473f06d7bd321a7d385

   and there is no such document in the `business` collection - it is a
   business that was deleted at some point. The rows were never visible under
   any selectable business; they were only ever showing through the unscoped
   first request. The same defect empties the Agent dropdown on GRC / GRT /
   Debit Note, which is business-scoped through /api/options?ref=agent.

   The businessId was inherited, not invented: replaceAgentsFromExcel.mjs
   takes it from whatever agents already existed
   (`existing.find((a) => a.businessId)?.businessId`), and the agents it found
   were already pointing at the dead business.

   What this does
   --------------
   Repoints contacts whose businessId references a missing business onto the
   main branch, and - for agents - repairs typeId the same way, since those
   rows point at a Contact Type that also belonged to the dead business.
   Nothing is deleted, no field other than businessId/typeId is touched, and
   contacts already on a live business are left alone. Contact IDs are
   unaffected: nextContactId() numbers by prefix across the whole collection,
   not per business.

   The Contact Types owned by the dead business are deliberately NOT
   repointed - the main branch already has its own "Vendor for Goods" and
   would end up with two.

   Usage
   -----
     npm run fix:orphan-contacts          # dry run, changes nothing
     npm run fix:orphan-contacts:apply    # writes, after a JSON backup

   Options
     --kind=Agent      restrict to one contactKind (default: every kind)
     --business=<id>   target business (default: the main branch)
*/

import mongoose from 'mongoose';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || '';
const KIND = arg('kind');
const TARGET_ARG = arg('business');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/fixOrphanContactBusinessId.mjs');
  process.exit(1);
}

const name = (c) =>
  String(c.businessName || '').trim()
  || [c.firstName, c.middleName, c.lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ')
  || '(no name)';

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;
const contacts = db.collection('contact');

/* ---------------------------------------------------------------- target -- */

const businesses = await db.collection('business').find({}).toArray();
const live = new Set(businesses.map((b) => String(b._id)));

const target = TARGET_ARG
  ? businesses.find((b) => String(b._id) === TARGET_ARG)
  : businesses.find((b) => b.isMainBranch) || businesses[0];

if (!target) {
  console.error('No business to repoint onto - is the `business` collection empty?');
  process.exit(1);
}
console.log(`Businesses on record: ${businesses.length}`);
businesses.forEach((b) => console.log(`  ${b._id}  ${b.name}${b.isMainBranch ? '   [main branch]' : ''}`));
console.log(`\nTarget business: ${target._id}  ${target.name}\n`);

/* ---------------------------------------------------------------- orphans -- */

const q = { businessId: { $ne: null } };
if (KIND) q.contactKind = KIND;

const all = await contacts.find(q).toArray();
const orphans = all.filter((c) => !live.has(String(c.businessId)));

if (!orphans.length) {
  console.log('No contact points at a missing business. Nothing to do.');
  await mongoose.disconnect();
  process.exit(0);
}

const byDeadBusiness = {};
orphans.forEach((c) => {
  const k = `${String(c.businessId)}  ${c.contactKind}`;
  (byDeadBusiness[k] ||= []).push(c);
});

console.log('--- CONTACTS POINTING AT A MISSING BUSINESS ---');
Object.entries(byDeadBusiness).forEach(([k, list]) => {
  console.log(`  ${k}  x${list.length}`);
  list.forEach((c) => console.log(`      ${String(c.contactId || '-').padEnd(10)} ${name(c)}`));
});

/* ------------------------------------------------------------- contact type -- */

/* The dead business owned its own Contact Types, so an orphan's typeId is
   dangling too. Match it onto the target business's type of the same kind,
   preferring the one whose prefix the contactId already uses (AGENT1 ->
   the AGENTS type, prefix AGENT) so nothing about the record changes meaning. */
const types = await db.collection('contacttype').find({ businessId: target._id }).toArray();

const typeFor = (c) => {
  if (c.typeId && types.some((t) => String(t._id) === String(c.typeId))) return null; // already fine
  const sameKind = types.filter((t) => t.contactType === c.contactKind);
  if (!sameKind.length) return undefined; // nothing to map onto
  const code = String(c.contactId || '');
  const byPrefix = sameKind
    .filter((t) => t.prefix && code.startsWith(t.prefix))
    .sort((a, b) => String(b.prefix).length - String(a.prefix).length)[0];
  return byPrefix || sameKind[0];
};

console.log('\n--- CONTACT TYPE REMAP ---');
const typeMoves = [];
const unmapped = [];
orphans.forEach((c) => {
  const t = typeFor(c);
  if (t === null) return;
  if (t === undefined) { unmapped.push(c); return; }
  typeMoves.push({ c, t });
});
typeMoves.forEach(({ c, t }) =>
  console.log(`  ${String(c.contactId || '-').padEnd(10)} ${String(c.typeId || 'null')} -> ${t._id}  ${t.name} (${t.contactType}, prefix ${t.prefix})`));
if (!typeMoves.length) console.log('  (none needed)');
unmapped.forEach((c) =>
  console.log(`  WARNING  ${c.contactId}: ${target.name} has no "${c.contactKind}" Contact Type - typeId left as is`));

/* ------------------------------------------------------------- collisions -- */

/* contactId is indexed but not unique, and nextContactId() numbers by prefix
   across the whole collection rather than per business - so a code is only
   really ambiguous when the two records would land in the SAME list, i.e.
   same business AND same contactKind. A code shared across kinds (a Customer
   called AGENT5 and an Agent called AGENT5) shows up on two different screens
   and is left alone; it is only reported. */
const codes = orphans.map((c) => c.contactId).filter(Boolean);
const near = codes.length
  ? await contacts.find({
      contactId: { $in: codes },
      businessId: target._id,
      _id: { $nin: orphans.map((c) => c._id) },
    }).toArray()
  : [];

const kindsFor = {};
orphans.forEach((c) => { if (c.contactId) (kindsFor[c.contactId] ||= new Set()).add(c.contactKind); });
const clashes = near.filter((c) => kindsFor[c.contactId]?.has(c.contactKind));
const crossKind = near.filter((c) => !kindsFor[c.contactId]?.has(c.contactKind));

console.log('\n--- CONTACT ID COLLISIONS ON THE TARGET BUSINESS ---');
crossKind.forEach((c) =>
  console.log(`  note   ${c.contactId} is also used by a ${c.contactKind} ("${name(c)}") - different list, no conflict`));
if (clashes.length) {
  clashes.forEach((c) => console.log(`  CLASH  ${c.contactId}  ${c.contactKind}  ${name(c)}  (${c._id})`));
  console.log('\nRefusing to move: two records of the same kind would share a code on the same list.');
  await mongoose.disconnect();
  process.exit(1);
}
if (!near.length) console.log('  none');

/* ------------------------------------------------------------------ apply -- */

console.log(`\n${orphans.length} contact(s) would be repointed onto ${target.name}.`);
if (!APPLY) {
  console.log('\nDRY RUN - nothing written. Re-run with --apply to make the change.');
  await mongoose.disconnect();
  process.exit(0);
}

const dir = path.join(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `orphan-contacts-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(orphans, null, 2));
console.log(`Backup written: ${file}`);

const res = await contacts.updateMany(
  { _id: { $in: orphans.map((c) => c._id) } },
  { $set: { businessId: target._id } },
);
console.log(`businessId updated: matched ${res.matchedCount}, modified ${res.modifiedCount}`);

let typed = 0;
for (const { c, t } of typeMoves) {
  const r = await contacts.updateOne({ _id: c._id }, { $set: { typeId: t._id } });
  typed += r.modifiedCount;
}
console.log(`typeId updated: ${typed}`);

const left = (await contacts.find({ businessId: { $ne: null } }).toArray())
  .filter((c) => !live.has(String(c.businessId))).length;
console.log(`\nContacts still pointing at a missing business: ${left}`);

await mongoose.disconnect();
