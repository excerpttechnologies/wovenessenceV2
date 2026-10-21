import { MongoClient } from 'mongodb';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const updates = [
  { code: 'G1317', name: 'REVASTRA (formerly KANUSRII Texfab), KOLKATA' },
  { code: 'G1319', name: 'RAJASTHAN Textiles, KOLKATA' },
  { code: 'G1318', name: 'HEART & SOUL Ethnique Wear LLP, SURAT' },
  { code: 'G1326', name: 'RANGOLI Prints, VARANASI' },
];
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('scripts/backup', { recursive: true });
const backup = { ts, contact: [], supplier: [] };
for (const coll of ['contact', 'supplier']) {
  for (const u of updates) {
    const docs = await db.collection(coll).find({ contactId: u.code }).toArray();
    backup[coll].push(...docs);
  }
}
const backupPath = `scripts/backup/supplier-name-fix-${ts}.json`;
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log('backup', backupPath, 'contact docs', backup.contact.length, 'supplier docs', backup.supplier.length);
if (!APPLY) {
  console.log('DRY RUN — no writes.');
  for (const u of updates) console.log(u.code, '->', u.name);
  await c.close();
  process.exit(0);
}
for (const u of updates) {
  const r1 = await db.collection('contact').updateMany({ contactId: u.code }, { $set: { businessName: u.name } });
  const r2 = await db.collection('supplier').updateMany({ contactId: u.code }, { $set: { businessName: u.name } });
  console.log(u.code, JSON.stringify({ contact: { matched: r1.matchedCount, modified: r1.modifiedCount }, supplier: { matched: r2.matchedCount, modified: r2.modifiedCount } }));
}
for (const u of updates) {
  const docs = await db.collection('contact').find({ contactId: u.code }).project({ contactId: 1, businessName: 1 }).toArray();
  console.log('verify', u.code, JSON.stringify(docs.map((d) => d.businessName)));
}
await c.close();
