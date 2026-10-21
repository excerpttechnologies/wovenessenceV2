/* ==========================================================================
   COPY EVERYTHING MISSING FROM THE OLD DB TO THE NEW DB (user, 16-10-2026).

   After scripts/copyNewDataToDb.mjs put the newData.xlsx data into the new
   database, the rest of the old database (users, roles, settings, every
   transaction...) is copied across so the app can run on the new one.

     SOURCE_MONGODB_URI=<old> TARGET_MONGODB_URI=<new> node scripts/copyMissingToDb.mjs [--db=test] [--apply]

     (default)  DRY RUN - per collection: documents in old / new / to copy.
     --apply    copies.

   INSERT-ONLY: a document is written only when its _id is not in the new DB
   yet ($setOnInsert upsert) - nothing already there is ever overwritten, so
   it is safe to re-run. The old DB is only read. Indexes are copied too
   (createIndex with the old DB's key + options; an index that already
   exists is left alone). URIs come from the environment only.
   ========================================================================== */

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const TARGET_DB = arg('db', 'test');
const BATCH = 1000;

async function main() {
  if (!process.env.SOURCE_MONGODB_URI || !process.env.TARGET_MONGODB_URI) {
    throw new Error('Set SOURCE_MONGODB_URI (old) and TARGET_MONGODB_URI (new)');
  }
  if (process.env.SOURCE_MONGODB_URI === process.env.TARGET_MONGODB_URI) throw new Error('Source and target are the same');

  const srcConn = await mongoose.createConnection(process.env.SOURCE_MONGODB_URI).asPromise();
  const tgtConn = await mongoose.createConnection(process.env.TARGET_MONGODB_URI, { dbName: TARGET_DB }).asPromise();
  const src = srcConn.db;
  const tgt = tgtConn.db;

  const collections = (await src.listCollections({}, { nameOnly: true }).toArray())
    .filter((c) => c.type !== 'view' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - copy missing data: ${src.databaseName} -> ${tgt.databaseName} (${collections.length} collections)\n`);
  const report = [];
  let totalCopied = 0;

  for (const name of collections) {
    const s = src.collection(name);
    const t = tgt.collection(name);
    const inOld = await s.estimatedDocumentCount();
    const inNew = await t.estimatedDocumentCount();
    let copied = 0;
    let indexes = 0;

    if (APPLY) {
      let batch = [];
      const flush = async () => {
        if (!batch.length) return;
        const res = await t.bulkWrite(
          batch.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $setOnInsert: d }, upsert: true } })),
          { ordered: false }
        );
        copied += res.upsertedCount;
        batch = [];
      };
      for await (const doc of s.find({})) {
        batch.push(doc);
        if (batch.length >= BATCH) await flush();
      }
      await flush();

      /* indexes, after the data so a unique index sees every row */
      for (const ix of await s.indexes()) {
        if (ix.name === '_id_') continue;
        const { key, v, ns, ...options } = ix;
        try {
          await t.createIndex(key, options);
          indexes += 1;
        } catch (err) {
          console.log(`  ! index ${name}.${ix.name}: ${err.message}`);
        }
      }
    }
    totalCopied += copied;
    report.push(APPLY
      ? { collection: name, inOld, inNewBefore: inNew, copied, indexes }
      : { collection: name, inOld, inNew, toCopyAbout: Math.max(0, inOld - inNew) });
  }

  console.table(report);
  console.log(APPLY ? `\ncopied ${totalCopied} documents.` : '\n*** DRY RUN - nothing written. Re-run with --apply to copy. ***');
  await srcConn.close();
  await tgtConn.close();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
