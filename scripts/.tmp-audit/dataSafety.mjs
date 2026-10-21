/* READ-ONLY data safety check.
   1. `contact` now vs the backup taken just before the split, every document, every field.
   2. Every collection: document count, and documents created / updated today. */
import fs from 'node:fs';
import readline from 'node:readline';
import mongoose from 'mongoose';

const BACKUP = 'backups/contact-before-contact-split-2026-09-15T10-02-33-509Z.ndjson';
const TODAY = new Date('2026-09-15T00:00:00Z');
const { EJSON } = mongoose.mongo.BSON;

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('=== 1. contact collection vs backup (' + BACKUP + ') ===');
const backup = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(BACKUP), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const doc = EJSON.parse(line, { relaxed: false });
  backup.set(String(doc._id), EJSON.stringify(doc, { relaxed: false }));
}
let same = 0; const changed = []; const added = [];
const seen = new Set();
for await (const doc of db.collection('contact').find({})) {
  const id = String(doc._id); seen.add(id);
  const now = EJSON.stringify(doc, { relaxed: false });
  if (!backup.has(id)) added.push(doc);
  else if (backup.get(id) === now) same++;
  else changed.push({ id, kind: doc.contactKind, code: doc.contactId, updatedAt: doc.updatedAt, before: EJSON.parse(backup.get(id)), after: doc });
}
const removed = [...backup.keys()].filter((id) => !seen.has(id));
console.log(`  backup documents: ${backup.size} | now: ${seen.size}`);
console.log(`  identical: ${same} | changed: ${changed.length} | removed: ${removed.length} | added: ${added.length}`);
for (const c of changed.slice(0, 20)) {
  const fields = [...new Set([...Object.keys(c.before), ...Object.keys(c.after)])]
    .filter((k) => JSON.stringify(c.before[k]) !== JSON.stringify(EJSON.parse(EJSON.stringify(c.after[k] ?? null))));
  console.log(`    changed ${c.id} ${c.kind} ${c.code} updatedAt ${c.updatedAt?.toISOString?.()} fields: ${fields.join(', ')}`);
}
removed.slice(0, 20).forEach((id) => console.log('    removed ' + id + ' ' + EJSON.parse(backup.get(id)).contactId));
added.slice(0, 20).forEach((d) => console.log(`    added ${d._id} ${d.contactKind} ${d.contactId} ${JSON.stringify(d.businessName)} created ${d.createdAt?.toISOString?.()}`));

console.log('\n=== 2. every collection: count, and writes today (createdAt / updatedAt >= 2026-09-15) ===');
const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
for (const n of names) {
  const c = db.collection(n);
  const total = await c.estimatedDocumentCount();
  const created = await c.countDocuments({ createdAt: { $gte: TODAY } });
  const updated = await c.countDocuments({ updatedAt: { $gte: TODAY }, createdAt: { $lt: TODAY } });
  if (created || updated) {
    const last = await c.find({ $or: [{ createdAt: { $gte: TODAY } }, { updatedAt: { $gte: TODAY } }] }).sort({ updatedAt: -1 }).limit(1).project({ updatedAt: 1, createdAt: 1 }).toArray();
    console.log(`  ${n.padEnd(34)} total ${String(total).padStart(6)} | created today ${created} | updated today ${updated} | latest ${last[0]?.updatedAt?.toISOString?.() || last[0]?.createdAt?.toISOString?.()}`);
  }
}
console.log('  (collections not listed had no document created or updated today)');
console.log('\n  key counts: ' + JSON.stringify(Object.fromEntries(await Promise.all(
  ['grc', 'barcodeLabel', 'stockmovement', 'item', 'posinvoice', 'salesinvoice', 'purchaseinvoice', 'delivery', 'ledger', 'voucher', 'user', 'business', 'customers']
    .map(async (n) => [n, await db.collection(n).countDocuments()])))));
await mongoose.disconnect();
