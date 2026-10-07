/* Barcode Start Number.

   The bug: Barcode Settings configured "Prefix 9A, Start Number 1000" and
   previewed 9A1000, but generation produced 9A0001. loadFormat() returned
   prefix/suffix/width and never read startNumber, so reserveBarcodeNumbers
   upserted a counter at 0 and issued 1.

   Asserted here against the REAL lib/barcodeEngine.js and the real counter
   collection:

     - a fresh series starts AT the configured Start Number
     - consecutive reservations continue from there
     - a series whose counter is already BELOW the start number is lifted to
       it (this is the live 9A case: counter at 28, start 1000)
     - a Start Number set BELOW numbers already printed never reissues them
     - lowering Start Number does not walk the counter backwards

   Everything it creates uses a ZZBC prefix and is removed at the end. The
   live 9A counter is never touched.

   Run with:  npm run test:barcode-start
*/

import mongoose from 'mongoose';
import path from 'path';
import { pathToFileURL } from 'url';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  -> ' + d : ''))); };

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const counters = db.collection('counter');

const load = (f) => import(pathToFileURL(path.join(process.cwd(), f)).href);
const { reserveBarcodeNumbers } = await load('lib/barcodeEngine.js');
const { BarcodeLabel } = await load('lib/barcodeLabel.js');

const biz = (await db.collection('business').findOne({ isMainBranch: true }))
  || (await db.collection('business').findOne({}));
const businessId = String(biz._id);

async function cleanup() {
  await counters.deleteMany({ key: /ZZBC/ });
  await db.collection('barcodeLabel').deleteMany({ barcodeNo: /^ZZBC/ });
}

const seqOf = async (prefix) =>
  (await counters.findOne({ key: 'barcode:' + prefix + ':-|' + businessId + '|-|-' }))?.seq ?? null;

try {
  await cleanup();

  /* ---- 1. a fresh series honours Start Number ------------------------- */
  const fmtA = { prefix: 'ZZBCA', suffix: '', width: 4, start: 1000 };
  const first = await reserveBarcodeNumbers(3, { businessId, setting: fmtA });
  ok('a fresh series starts at the configured Start Number',
    first[0] === 'ZZBCA1000', first.join(', '));
  ok('and runs consecutively from there',
    first.join(',') === 'ZZBCA1000,ZZBCA1001,ZZBCA1002', first.join(', '));

  const next = await reserveBarcodeNumbers(2, { businessId, setting: fmtA });
  ok('a second reservation continues rather than restarting',
    next.join(',') === 'ZZBCA1003,ZZBCA1004', next.join(', '));

  /* ---- 2. the LIVE 9A case: counter already exists, below the start ---- */
  const fmtB = { prefix: 'ZZBCB', suffix: '', width: 4, start: 1000 };
  /* stand in for the real 9A counter sitting at 28 */
  await counters.updateOne(
    { key: 'barcode:ZZBCB:-|' + businessId + '|-|-' },
    { $set: { seq: 28 } },
    { upsert: true }
  );
  const lifted = await reserveBarcodeNumbers(1, { businessId, setting: fmtB });
  ok('an existing counter BELOW the start number is lifted to it (the 9A case)',
    lifted[0] === 'ZZBCB1000', lifted[0] + ' (counter was 28)');

  /* ---- 3. never reissue a number already printed ----------------------- */
  const fmtC = { prefix: 'ZZBCC', suffix: '', width: 4, start: 5 };
  /* a label already on physical goods, far above the configured start */
  await BarcodeLabel.create({ barcodeNo: 'ZZBCC0400', businessId, itemCode: 'ZZBC-ITEM' });
  const afterPrinted = await reserveBarcodeNumbers(1, { businessId, setting: fmtC });
  ok('a Start Number below what is already printed does NOT reissue',
    Number(afterPrinted[0].slice(5)) > 400, afterPrinted[0] + ' must be > ZZBCC0400');

  /* ---- 4. lowering Start Number never walks the counter back ----------- */
  const seqBefore = await seqOf('ZZBCA');
  await reserveBarcodeNumbers(1, { businessId, setting: { ...fmtA, start: 1 } });
  const seqAfter = await seqOf('ZZBCA');
  ok('lowering Start Number does not move the counter backwards',
    seqAfter > seqBefore, `${seqBefore} -> ${seqAfter}`);

  /* ---- 5. the live 9A counter is untouched by all of this -------------- */
  const live = await counters.findOne({ key: /^barcode:9A:/ });
  ok('the live 9A counter was not modified by this test',
    live?.seq === 28, 'seq=' + live?.seq + ' (expected 28)');
} finally {
  await cleanup();
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}
