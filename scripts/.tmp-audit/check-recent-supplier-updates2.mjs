import fs from 'fs';
import { MongoClient } from 'mongodb';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const cut = new Date(Date.now() - 6 * 60 * 60 * 1000);
for (const coll of ['contact', 'supplier']) {
  const recent = await db.collection(coll).find({ updatedAt: { $gt: cut } }).project({ contactId: 1, businessName: 1, contactKind: 1, updatedAt: 1 }).limit(30).toArray();
  console.log(`\n${coll} updated in last 6h:`, recent.length);
  for (const r of recent.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 20)) console.log(JSON.stringify({ code: r.contactId, name: r.businessName, kind: r.contactKind, at: r.updatedAt }));
  const gNames = await db.collection(coll).find({ businessName: /^G\d+/i }).project({ contactId: 1, businessName: 1 }).limit(20).toArray();
  console.log(`${coll} docs whose businessName starts with a G-code:`, gNames.length);
  for (const r of gNames.slice(0, 20)) console.log(JSON.stringify({ code: r.contactId, name: r.businessName }));
}
await c.close();
