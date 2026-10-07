/* Delivery / LR transaction numbering.

   The defect this proves fixed: opening the Add dialog on
   /admin/transport/delivery consumed a number. The dialog fetched
   GET /api/delivery?nextNumber=1 on mount, and that endpoint called the
   ALLOCATING helper - so open/cancel/open walked the series
   LR/26/022 -> 023 -> 024 with nothing ever saved.

   Asserted here, against the real lib/docnumber.js and the real counter
   collection:

     - previewing does not move the counter, however many times it is called
     - preview and the number actually issued agree
     - saving consumes exactly one, and the next preview reflects it
     - two concurrent saves never receive the same number
     - a Transaction No typed by hand pushes the counter past itself, so
       auto-numbering cannot later reissue it

   Everything it creates is prefixed ZZLR and removed at the end.
   Run with:  npm run test:delivery
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
const { nextSeriesNumber, previewSeriesNumber, raiseSeriesFloor } = await load('lib/docnumber.js');
const { default: Delivery } = await load('models/Delivery.js');

/* a series of its own, so a real LR counter is never touched */
const PREFIX = 'ZZLR/26/';
const finYear = '2026-2027';
const biz = (await db.collection('business').findOne({ isMainBranch: true }))
  || (await db.collection('business').findOne({}));
const scope = { businessId: biz?._id, finYear };

async function cleanup() {
  await db.collection('delivery').deleteMany({ transactionNo: /^ZZLR/ });
  await counters.deleteMany({ key: /ZZLR/ });
}

const preview = () => previewSeriesNumber(Delivery, 'transactionNo', PREFIX, { scope });
const issue = () => nextSeriesNumber(Delivery, 'transactionNo', PREFIX, { scope });
const seq = async () => (await counters.findOne({ key: new RegExp('^series:' + PREFIX) }))?.seq ?? null;

try {
  await cleanup();

  /* TEST 1-4: opening the dialog, five times, changes nothing ------------ */
  const first = await preview();
  const before = await seq();
  const previews = [];
  for (let i = 0; i < 5; i += 1) previews.push(await preview());

  ok('five previews all return the same number',
    previews.every((p) => p === first), first + ' vs ' + previews.join(', '));
  ok('preview never creates or moves the counter',
    (await seq()) === before, 'seq ' + before + ' -> ' + (await seq()));

  /* TEST 5: saving consumes exactly one ---------------------------------- */
  const issued = await issue();
  ok('the number issued on save is the one previewed', issued === first, first + ' vs ' + issued);
  await Delivery.create({ transactionNo: issued, finYear, businessId: biz?._id, lrNumber: 'ZZLR-A' });

  /* TEST 6: and only one --------------------------------------------------*/
  const after = await preview();
  ok('the next preview is exactly one higher',
    Number(after.slice(PREFIX.length)) === Number(issued.slice(PREFIX.length)) + 1,
    issued + ' -> ' + after);
  ok('one save consumed one number', (await seq()) - (before ?? 0) === 1);

  /* TEST 7: two users saving at the same moment --------------------------- */
  const race = await Promise.all(Array.from({ length: 10 }, () => issue()));
  ok('ten concurrent saves get ten distinct numbers',
    new Set(race).size === 10, race.join(', '));

  /* a number typed by hand must not be reissued later --------------------- */
  const manual = PREFIX + '900';
  await Delivery.create({ transactionNo: manual, finYear, businessId: biz?._id, lrNumber: 'ZZLR-B' });
  await raiseSeriesFloor(PREFIX, { scope }, 900);
  ok('auto-numbering resumes past a hand-typed number',
    Number((await issue()).slice(PREFIX.length)) > 900);

  /* preview of an untouched series reads the highest already on disk ------ */
  await counters.deleteMany({ key: /ZZLR/ });
  const seeded = await preview();
  ok('an unseeded series previews from the highest number on disk',
    seeded === PREFIX + '901', seeded);
  ok('...and previewing it still wrote no counter', (await seq()) === null);
} finally {
  await cleanup();
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}
