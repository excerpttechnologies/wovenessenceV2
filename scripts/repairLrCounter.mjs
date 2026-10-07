/* Reclaims LR numbers burned by the old open-the-dialog-consumes-a-number bug.

   Until the fix, GET /api/delivery?nextNumber=1 ALLOCATED rather than
   previewed, so every time the Add dialog was opened and closed the counter
   moved on. One live series was left at seq=25 with only two deliveries
   saved and LR/26/021 the highest issued: numbers 022-025 were consumed by
   nothing and the next save would have skipped to 026.

   This walks each LR series back to the highest number ACTUALLY ON A
   DELIVERY, so numbering resumes where the documents left off.

   SAFE BY CONSTRUCTION:

     - no delivery is read for anything but its number, and none is written
     - a counter is only ever lowered to the highest number in use, so no
       number a live document holds can be reissued
     - a counter already at or below that highest number is left alone, which
       is why running it twice is a no-op
     - nothing is written at all without --apply

   Dry run:  node --env-file=.env scripts/repairLrCounter.mjs
   Apply:    node --env-file=.env scripts/repairLrCounter.mjs --apply
*/

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const counters = db.collection('counter');

const rows = await counters.find({ key: /^series:LR\// }).toArray();
if (!rows.length) console.log('No LR counters found.');

let changed = 0;
for (const c of rows) {
  /* key is "series:<prefix>|<businessId>|<locationId>|<finYear>" */
  const [name, businessId, , finYear] = c.key.split('|');
  const prefix = name.replace(/^series:/, '');

  const filter = {
    transactionNo: { $regex: '^' + escapeRegex(prefix) },
    ...(businessId && businessId !== '-' ? { businessId: new mongoose.Types.ObjectId(businessId) } : {}),
    ...(finYear && finYear !== '-' ? { finYear } : {}),
  };

  const used = await db.collection('delivery').find(filter).project({ transactionNo: 1 }).toArray();
  const highest = used.reduce((max, d) => {
    const n = parseInt(String(d.transactionNo ?? '').slice(prefix.length).match(/^\d+/)?.[0] ?? '', 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  const burned = c.seq - highest;
  console.log('\n' + c.key);
  console.log('  counter          ' + c.seq);
  console.log('  highest in use   ' + highest + '  (' + used.length + ' deliveries)');

  if (burned <= 0) { console.log('  -> already correct, left alone'); continue; }

  console.log('  -> ' + burned + ' number(s) consumed by nothing; next would be '
    + prefix + String(c.seq + 1).padStart(3, '0')
    + ', should be ' + prefix + String(highest + 1).padStart(3, '0'));

  if (APPLY) {
    await counters.updateOne({ _id: c._id }, { $set: { seq: highest } });
    console.log('  -> reset to ' + highest);
  }
  changed += 1;
}

console.log('\n' + (APPLY
  ? changed + ' counter(s) reset.'
  : changed + ' counter(s) would be reset. Re-run with --apply to write.'));

await mongoose.disconnect();

function escapeRegex(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
