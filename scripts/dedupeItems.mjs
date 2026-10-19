import mongoose from 'mongoose';
import { mkdirSync, writeFileSync } from 'fs';

import Item from '../models/Item.js';

/* Make Item.name unique per business without breaking the flow.

   Usage (from project root):
     node --env-file=.env scripts/dedupeItems.mjs                 # DRY RUN (default, changes nothing)
     node --env-file=.env scripts/dedupeItems.mjs --apply         # backup + delete duplicates
     node --env-file=.env scripts/dedupeItems.mjs --apply --repoint --index
   Optional first arg: a businessId (24-hex). Default below.

   --apply     really delete. Without it nothing is written.
   --repoint   if other collections reference a duplicate _id, rewrite those
               references to the kept item's _id (otherwise --apply ABORTS).
   --index     afterwards create unique index { businessId, name }.

   Keeper per name = row with hsnId + uomId set (the original, good row),
   then oldest createdAt. Names are compared after trim + whitespace collapse
   (fixes '\t4-F-TSR'). Every deleted doc is saved to scripts/backup/ first,
   plus a barcodes CSV (name, itemCode) so no barcode is lost. */

const BUSINESS_ID =
  process.argv.find((a) => /^[0-9a-f]{24}$/.test(a)) || '6a853cdefb266c4358beb548';
const APPLY = process.argv.includes('--apply');
const REPOINT = process.argv.includes('--repoint');
const INDEX = process.argv.includes('--index');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/dedupeItems.mjs');
  process.exit(1);
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const isOid = (v) => v && v._bsontype === 'ObjectId';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Connected. Business ${BUSINESS_ID}. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const items = await Item.find({ businessId: BUSINESS_ID }).lean();
  console.log(`${items.length} items loaded`);

  // 1. group by normalised name, choose keeper
  const groups = new Map();
  for (const it of items) {
    const k = norm(it.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }

  const keepers = [];
  const dupes = [];
  const dupToKeeper = new Map(); // String(dupId) -> keeper._id
  for (const [, list] of groups) {
    list.sort((a, b) => {
      const sa = (a.hsnId ? 1 : 0) + (a.uomId ? 1 : 0);
      const sb = (b.hsnId ? 1 : 0) + (b.uomId ? 1 : 0);
      if (sa !== sb) return sb - sa;
      return new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id));
    });
    const [keep, ...rest] = list;
    keepers.push(keep);
    for (const d of rest) {
      dupes.push(d);
      dupToKeeper.set(String(d._id), keep._id);
    }
  }
  console.log(`Unique names (keep): ${keepers.length}`);
  console.log(`Duplicate rows (delete): ${dupes.length}`);

  const needsTrim = keepers.filter(
    (k) => k.name !== norm(k.name) || (k.itemCode != null && k.itemCode !== norm(k.itemCode)),
  );
  console.log(`Keepers needing name/itemCode trim: ${needsTrim.length}`, needsTrim.map((k) => JSON.stringify(k.name)));

  // 2. scan every other collection for references to duplicate _ids
  const itemColl = Item.collection.name;
  const colls = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => n !== itemColl && !n.startsWith('system.'));
  const scan = async (log, keep = false) => {
    const out = [];
    for (const name of colls) {
      let hits = 0;
      for await (const doc of db.collection(name).find({})) {
        const ids = JSON.stringify(doc).match(/[0-9a-f]{24}/g) || [];
        if (ids.some((id) => dupToKeeper.has(id))) {
          out.push(keep ? { coll: name, _id: doc._id, doc } : { coll: name, _id: doc._id });
          hits++;
        }
      }
      if (hits && log) console.log(`  REFERENCED in "${name}": ${hits} docs`);
    }
    return out;
  };
  const refs = await scan(true, true);
  console.log(refs.length ? `References to duplicates: ${refs.length} docs` : 'No other collection references the duplicates. Safe to delete.');

  if (!APPLY) {
    console.log('\nDRY RUN only. Re-run with --apply to execute.');
    await mongoose.disconnect();
    return;
  }
  if (refs.length && !REPOINT) {
    console.error('\nABORT: duplicates are referenced. Re-run with --repoint to move refs to the kept item.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // 3. backup
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync('scripts/backup', { recursive: true });
  const jsonPath = `scripts/backup/items_deleted_${stamp}.json`;
  const csvPath = `scripts/backup/item_barcodes_${stamp}.csv`;
  writeFileSync(jsonPath, JSON.stringify(dupes, null, 2));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(
    csvPath,
    ['name,itemCode,deletedItemId,keptItemId', ...dupes.map((d) => [q(norm(d.name)), q(norm(d.itemCode)), q(d._id), q(dupToKeeper.get(String(d._id)))].join(','))].join('\n'),
  );
  console.log(`Backup written:\n  ${jsonPath}\n  ${csvPath}`);

  // 4. repoint references (only when needed)
  if (refs.length) {
    const rewrite = (v) => {
      if (isOid(v)) return dupToKeeper.get(String(v)) ?? v;
      if (typeof v === 'string' && dupToKeeper.has(v)) return String(dupToKeeper.get(v));
      if (Array.isArray(v)) return v.map(rewrite);
      if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]));
      }
      return v;
    };
    // save originals BEFORE touching anything (docs already in memory from the scan)
    const refPath = `scripts/backup/refs_before_${stamp}.json`;
    writeFileSync(refPath, JSON.stringify(refs.map(({ coll, doc }) => ({ coll, doc }))));
    console.log(`Originals of ${refs.length} referencing docs saved: ${refPath}`);

    // bulk replace, 500 per call, grouped by collection
    const byColl = new Map();
    for (const { coll, doc } of refs) {
      if (!byColl.has(coll)) byColl.set(coll, []);
      byColl.get(coll).push(doc);
    }
    let done = 0;
    for (const [coll, docs] of byColl) {
      for (let i = 0; i < docs.length; i += 500) {
        const ops = docs.slice(i, i + 500).map((doc) => {
          const next = rewrite(doc);
          next._id = doc._id;
          return { replaceOne: { filter: { _id: doc._id }, replacement: next } };
        });
        await db.collection(coll).bulkWrite(ops, { ordered: false });
        done += ops.length;
        console.log(`  repointed ${done}/${refs.length} (${coll})`);
      }
    }
    console.log(`Repointed ${done} docs`);

    const left = await scan(true);
    if (left.length) {
      console.error(`ABORT: ${left.length} docs still reference duplicates. Nothing deleted.`);
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('Re-scan clean: no references to duplicates remain');
  }

  // 5. trim keepers
  for (const k of needsTrim) {
    const set = { name: norm(k.name) };
    if (k.itemCode != null) set.itemCode = norm(k.itemCode);
    if (k.ecommItemCode != null) set.ecommItemCode = norm(k.ecommItemCode);
    await Item.collection.updateOne({ _id: k._id }, { $set: set });
  }

  // 6. delete duplicates in chunks
  const dupIds = dupes.map((d) => d._id);
  let deleted = 0;
  for (let i = 0; i < dupIds.length; i += 1000) {
    const r = await Item.collection.deleteMany({ _id: { $in: dupIds.slice(i, i + 1000) }, businessId: new mongoose.Types.ObjectId(BUSINESS_ID) });
    deleted += r.deletedCount;
  }
  console.log(`Deleted ${deleted} duplicate items`);

  // 7. optional unique index
  if (INDEX) {
    try {
      await Item.collection.createIndex({ businessId: 1, name: 1 }, { unique: true, name: 'uniq_business_name' });
      console.log('Unique index { businessId, name } created');
    } catch (e) {
      console.error('Index failed:', e.message);
    }
  }

  const finalCount = await Item.countDocuments({ businessId: BUSINESS_ID });
  console.log(`\nFinal Item count: ${finalCount} (expected ${keepers.length})`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
