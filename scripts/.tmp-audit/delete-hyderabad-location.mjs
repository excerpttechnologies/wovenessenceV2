/* Deletes the unused "Hyderabad" Company Location (6abdf517b77de6438166c91b),
   but only after proving nothing references it. */
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';

const LOC = '6abdf517b77de6438166c91b';
const APPLY = process.argv.includes('--apply');
const FIELDS = ['locationId', 'locationIds', 'toLocationId', 'fromLocationId', 'currentLocationId'];

await dbConnect();
const db = mongoose.connection.db;
const loc = await db.collection('companylocation').findOne({ _id: new mongoose.Types.ObjectId(LOC) });
if (!loc) { console.log('location already gone'); process.exit(0); }
console.log('target:', loc.name, '| city', loc.city, '| state', loc.state, '| gstin', JSON.stringify(loc.gstin), '| biz', String(loc.businessId));

const oid = new mongoose.Types.ObjectId(LOC);
const refs = [];
const colls = (await db.listCollections().toArray()).map((c) => c.name)
  .filter((n) => !['barcodeLabel', 'stockmovement'].includes(n)); /* already verified 0 */

for (const name of colls) {
  const ors = [];
  for (const f of FIELDS) {
    ors.push({ [f]: oid }, { [f]: LOC });
  }
  let n = 0;
  try { n = await db.collection(name).countDocuments({ $or: ors }); } catch { n = 0; }
  if (n) refs.push(name + '=' + n);
}

/* the two big collections, checked directly too */
const big = {
  barcodeLabel: await db.collection('barcodeLabel').countDocuments({ $or: [{ locationId: LOC }, { currentLocationId: oid }] }),
  stockMovement: await db.collection('stockMovement').countDocuments({ $or: [{ fromLocationId: oid }, { toLocationId: oid }] }),
};
console.log('references:', refs.length ? refs.join(', ') : 'none');
console.log('bulk collections:', JSON.stringify(big));

const blocking = refs.length || big.barcodeLabel || big.stockMovement;
if (blocking) { console.log('\nREFUSED - something still points at this store; nothing deleted'); process.exit(1); }
if (!APPLY) { console.log('\nDRY RUN - re-run with --apply to delete'); process.exit(0); }

const res = await db.collection('companylocation').deleteOne({ _id: oid });
console.log('\ndeleted:', res.deletedCount);
await mongoose.connection.close();
