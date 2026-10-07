/* ==========================================================================
   SPLIT THE CONTACT COLLECTION - suppliers, customers and agents each into a
   collection of their own, WITH THEIR ORIGINAL _id.

     contact  { contactKind: 'Supplier' }  ->  supplier
     contact  { contactKind: 'Customer' }  ->  customer
     contact  { contactKind: 'Agent'    }  ->  agent

   `customer`, not `customers`: that collection already exists and belongs to
   the e-commerce storefront (shopper logins, unique index on email).

   WHY THE _id IS EVERYTHING
   supplierId, customerId, agentId and salesPersonId are stored on GRCs,
   deliveries, purchase invoices, POS bills, returns, challans and 23k barcode
   rows. Every one of them resolves today only to a record of the matching
   kind (audited before this script was written), so a record moved with the
   same _id keeps every one of those references working without a single
   referencing document being touched. Nothing here writes to any collection
   other than the three targets, `contact` on --rollback, and this script's
   own run record.

   NON-DESTRUCTIVE
   `contact` is never modified or deleted by a forward run. It stays as the
   backup and the rollback source until the split has been verified and the
   business decides to retire it - that is a separate, deliberate step this
   script does not offer.

   IDEMPOTENT AND RESTARTABLE
   Each record is copied only if it is missing from its target, or the
   `contact` copy is NEWER than the target (updatedAt). A second run copies
   nothing. A run interrupted halfway just carries on the next time.
   A record deleted through the new screens is NOT brought back from `contact`
   unless `contact` changed it after the last completed run (see WATERMARK).

   MODES
     node --env-file=.env scripts/migrateContactsToSeparateCollections.mjs
         dry run: classify, validate, and report what WOULD be copied
     ... --apply
         back up `contact`, build the target indexes, copy, verify
     ... --verify
         read only: full field-by-field comparison + reference/orphan check
     ... --prune [--apply]     before the switch only: remove copies whose
                               record `contact` no longer holds (backed up)
     ... --rollback            dry run of copying the split collections back
     ... --rollback --apply    into `contact` (backed up first), so reverting
                               the code loses nothing written since the split

   npm run contacts:split / contacts:split:apply / contacts:verify /
           contacts:prune / contacts:prune:apply /
           contacts:rollback / contacts:rollback:apply
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { CONTACT_KINDS, COLLECTION_BY_KIND, LEGACY_CONTACT_COLLECTION } from '../models/contactSchema.js';
import Supplier from '../models/Supplier.js';
import Customer from '../models/Customer.js';
import Agent from '../models/Agent.js';
import { isSplitContactStorage } from '../lib/contactStorage.js';

const { EJSON } = mongoose.mongo.BSON;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERIFY_ONLY = argv.includes('--verify');
const ROLLBACK = argv.includes('--rollback');
const PRUNE = argv.includes('--prune');
const BATCH = 1000;
const RUN_DOC_ID = 'contact-split';
const RUN_COLLECTION = 'schemamigration';
/* Clock skew allowance between the app servers that stamp updatedAt and this
   script. Generous on purpose: a wider window can only re-copy a record that
   was already current (harmless) or bring back one deleted in the new screens
   within those minutes (reported by id), never lose a write. */
const WATERMARK_SKEW_MS = 10 * 60 * 1000;

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set - run with node --env-file=.env');
  process.exit(1);
}

const MODELS = { Supplier, Customer, Agent };
const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

/* autoIndex / autoCreate off: importing the three models would otherwise
   create their collections and indexes the moment the connection opens -
   even on a dry run. Indexes are built explicitly, on --apply only. */
await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
const db = mongoose.connection.db;
const legacy = db.collection(LEGACY_CONTACT_COLLECTION);

const log = (...a) => console.log(...a);
const hr = (t) => log('\n' + '='.repeat(74) + '\n' + t + '\n' + '='.repeat(74));

/* ------------------------------------------------------------ helpers --- */

/* Canonical, type-preserving text of a document, keys sorted at every level,
   so two copies of one record compare equal exactly when every field, and
   every field's BSON type, is equal. */
function canonical(doc) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return EJSON.stringify(sort(doc), { relaxed: false });
}

const time = (d) => (d instanceof Date ? d.getTime() : null);

function diffFields(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => canonical({ v: a?.[k] }) !== canonical({ v: b?.[k] }));
}

async function runRecord() {
  return db.collection(RUN_COLLECTION).findOne({ _id: RUN_DOC_ID });
}

/* ------------------------------------------------------------- backup --- */

async function backupCollection(name) {
  const dir = path.join(ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + '-before-' + (ROLLBACK ? 'contact-rollback' : 'contact-split') + '-' + stamp + '.ndjson');
  const out = fs.createWriteStream(file);
  let lines = 0;
  for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
    /* canonical EJSON keeps ObjectId, Date and number types, so the file
       restores to exactly what was read */
    if (!out.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) {
      await new Promise((r) => out.once('drain', r));
    }
    lines += 1;
  }
  await new Promise((r) => out.end(r));
  const indexes = await db.collection(name).indexes();
  fs.writeFileSync(file.replace(/\.ndjson$/, '.indexes.json'), JSON.stringify(indexes, null, 2));
  const count = await db.collection(name).countDocuments();
  log('  backup  ' + path.relative(ROOT, file) + '  ' + lines + ' documents (collection holds ' + count + ')');
  if (lines < count) throw new Error('backup of ' + name + ' is short: ' + lines + ' of ' + count);
  return { file: path.relative(ROOT, file), lines };
}

/* --------------------------------------------------------------- copy --- */

/* Copies every document of `source` that belongs in `targetOf(doc)`.

   insert   the target does not hold the _id
   refresh  the target holds it, and the source copy is newer (updatedAt)
   skip     identical, or the target is the newer one
   conflict both exist, they differ, and there is no updatedAt to decide by -
            never overwritten, reported

   Writes are guarded: a refresh only lands if the target still carries the
   updatedAt this run read, so a save made through the app while the script
   runs is never overwritten by an older copy. */
async function copyAcross({ source, targetOf, classify, watermark, label }) {
  const totals = { read: 0, insert: 0, refresh: 0, skip: 0, conflict: 0, error: 0, notResurrected: 0 };
  const perTarget = {};
  const errors = [];
  const conflicts = [];
  const notResurrected = [];

  const cursor = db.collection(source).find({}).sort({ _id: 1 }).batchSize(BATCH);
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    const groups = new Map();
    for (const doc of batch) {
      const verdict = classify(doc);
      if (verdict.error) {
        totals.error += 1;
        errors.push({ _id: String(doc._id), contactKind: doc.contactKind ?? null, reason: verdict.error, fields: verdict.fields || [] });
        continue;
      }
      const target = targetOf(doc);
      if (!groups.has(target)) groups.set(target, []);
      groups.get(target).push(doc);
    }

    for (const [target, docs] of groups) {
      perTarget[target] ||= { insert: 0, refresh: 0, skip: 0, conflict: 0, error: 0, notResurrected: 0 };
      const existing = new Map(
        (await db.collection(target).find({ _id: { $in: docs.map((d) => d._id) } }).toArray())
          .map((d) => [String(d._id), d])
      );

      const ops = [];
      const opDoc = [];
      for (const doc of docs) {
        const have = existing.get(String(doc._id));
        if (!have) {
          /* Absent from the target. On a first run that means "not copied
             yet". After a completed run it can also mean "deleted through the
             new screens" - so it is only copied if the source record was
             created or changed after that run started. */
          if (watermark) {
            const touched = Math.max(time(doc.updatedAt) ?? 0, time(doc.createdAt) ?? 0);
            if (touched && touched < watermark) {
              totals.notResurrected += 1; perTarget[target].notResurrected += 1;
              notResurrected.push({ _id: String(doc._id), target, updatedAt: doc.updatedAt });
              continue;
            }
          }
          ops.push({ insertOne: { document: doc } });
          opDoc.push([doc, 'insert']);
          continue;
        }
        if (canonical(doc) === canonical(have)) {
          totals.skip += 1; perTarget[target].skip += 1;
          continue;
        }
        const src = time(doc.updatedAt);
        const tgt = time(have.updatedAt);
        if (src === null || tgt === null) {
          totals.conflict += 1; perTarget[target].conflict += 1;
          conflicts.push({ _id: String(doc._id), target, reason: 'copies differ and one has no updatedAt to order them by', fields: diffFields(doc, have) });
          continue;
        }
        if (src <= tgt) {
          /* the target is current - edited through the new screens */
          totals.skip += 1; perTarget[target].skip += 1;
          continue;
        }
        ops.push({ replaceOne: { filter: { _id: doc._id, updatedAt: have.updatedAt }, replacement: doc } });
        opDoc.push([doc, 'refresh']);
      }

      if (!ops.length) continue;
      if (!APPLY) {
        for (const [, kind] of opDoc) { totals[kind] += 1; perTarget[target][kind] += 1; }
        continue;
      }

      let result;
      try {
        result = await db.collection(target).bulkWrite(ops, { ordered: false });
      } catch (err) {
        result = err.result || null;
        const writeErrors = err.writeErrors || err.result?.getWriteErrors?.() || [];
        for (const we of writeErrors) {
          const idx = we.index ?? we.err?.index;
          const [doc] = opDoc[idx] || [];
          const code = we.code ?? we.err?.code;
          const msg = we.errmsg ?? we.err?.errmsg ?? String(we.message || '');
          totals.error += 1; perTarget[target].error += 1;
          errors.push({
            _id: doc ? String(doc._id) : '?',
            contactKind: doc?.contactKind ?? null,
            reason: code === 11000
              ? (/supplier_gstNo_unique/.test(msg) ? 'duplicate GST NO for this business in ' + target : 'already written to ' + target + ' by someone else during this run')
              : msg,
            fields: code === 11000 && /gstNo/.test(msg) ? ['businessId', 'gstNo'] : [],
          });
          opDoc[idx] = null;
        }
        if (!writeErrors.length) throw err;
      }
      /* count what actually landed; a guarded refresh that matched nothing
         lost a race to a save through the app, which is the right outcome */
      for (let i = 0; i < opDoc.length; i += 1) {
        if (!opDoc[i]) continue;
        const [doc, kind] = opDoc[i];
        totals[kind] += 1; perTarget[target][kind] += 1;
        void doc;
      }
      if (result) {
        const matched = result.matchedCount ?? result.nMatched ?? 0;
        const wantedRefresh = opDoc.filter((x) => x && x[1] === 'refresh').length;
        if (matched < wantedRefresh) {
          const lost = wantedRefresh - matched;
          totals.refresh -= lost; perTarget[target].refresh -= lost;
          totals.skip += lost; perTarget[target].skip += lost;
        }
      }
    }
    batch = [];
  };

  for await (const doc of cursor) {
    totals.read += 1;
    batch.push(doc);
    if (batch.length >= BATCH) {
      await flush();
      process.stdout.write('\r  ' + label + ': ' + totals.read + ' read');
    }
  }
  await flush();
  process.stdout.write('\r  ' + label + ': ' + totals.read + ' read\n');

  return { totals, perTarget, errors, conflicts, notResurrected };
}

/* The forward classification: the real discriminator, and nothing else. No
   guessing from names, e-mails or codes - a record whose contactKind is not
   one of the three is reported and left where it is. */
function classifyForward(doc) {
  if (!(doc._id instanceof mongoose.Types.ObjectId)) {
    return { error: '_id is not an ObjectId (' + typeof doc._id + ')', fields: ['_id'] };
  }
  if (!CONTACT_KINDS.includes(doc.contactKind)) {
    return { error: 'contactKind is ' + JSON.stringify(doc.contactKind ?? null) + ' - not Supplier, Customer or Agent', fields: ['contactKind'] };
  }
  return {};
}

/* ------------------------------------------------------------- verify --- */

/* Every record in `contact` must be in its kind's collection with the same
   _id and every field equal - unless the target copy is NEWER, which is a
   save made through the new screens after the split. */
async function verifySplit() {
  hr('VERIFY - every record, every field');
  const byKind = {};
  for (const kind of CONTACT_KINDS) {
    byKind[kind] = { source: 0, target: 0, equal: 0, newerInTarget: 0, missing: [], different: [], onlyInTarget: 0 };
  }
  const sourceIds = Object.fromEntries(CONTACT_KINDS.map((k) => [k, new Set()]));

  let batch = [];
  const check = async () => {
    const groups = {};
    for (const d of batch) (groups[d.contactKind] ||= []).push(d);
    for (const [kind, docs] of Object.entries(groups)) {
      if (!byKind[kind]) continue;
      const target = COLLECTION_BY_KIND[kind];
      const have = new Map((await db.collection(target).find({ _id: { $in: docs.map((d) => d._id) } }).toArray()).map((d) => [String(d._id), d]));
      for (const d of docs) {
        const t = have.get(String(d._id));
        if (!t) { byKind[kind].missing.push(String(d._id)); continue; }
        if (canonical(d) === canonical(t)) { byKind[kind].equal += 1; continue; }
        if ((time(t.updatedAt) ?? 0) > (time(d.updatedAt) ?? 0)) { byKind[kind].newerInTarget += 1; continue; }
        byKind[kind].different.push({ _id: String(d._id), fields: diffFields(d, t) });
      }
    }
    batch = [];
  };

  for await (const d of legacy.find({}).sort({ _id: 1 })) {
    if (byKind[d.contactKind]) { byKind[d.contactKind].source += 1; sourceIds[d.contactKind].add(String(d._id)); }
    batch.push(d);
    if (batch.length >= BATCH) await check();
  }
  await check();

  let ok = true;
  for (const kind of CONTACT_KINDS) {
    const target = COLLECTION_BY_KIND[kind];
    const r = byKind[kind];
    r.target = await db.collection(target).countDocuments();
    for await (const t of db.collection(target).find({}, { projection: { _id: 1 } })) {
      if (!sourceIds[kind].has(String(t._id))) r.onlyInTarget += 1;
    }
    /* a record of the wrong kind in a kind's collection */
    r.wrongKind = await db.collection(target).countDocuments({ contactKind: { $ne: kind } });
    /* the same _id in two kinds' collections - the data has no multi-role
       records, so this must stay 0 */
    const pass = r.missing.length === 0 && r.different.length === 0 && r.wrongKind === 0;
    ok &&= pass;
    log(
      '  ' + (pass ? 'ok  ' : 'FAIL') + ' ' + kind.padEnd(8) + ' contact ' + String(r.source).padStart(6) +
      '  ->  ' + target.padEnd(8) + ' ' + String(r.target).padStart(6) +
      '   identical ' + r.equal + ', newer in ' + target + ' ' + r.newerInTarget +
      ', missing ' + r.missing.length + ', differing ' + r.different.length +
      ', only in ' + target + ' ' + r.onlyInTarget + ', wrong kind ' + r.wrongKind
    );
    if (r.missing.length) log('       missing ids: ' + r.missing.slice(0, 20).join(', ') + (r.missing.length > 20 ? ' ...' : ''));
    if (r.different.length) log('       differing: ' + JSON.stringify(r.different.slice(0, 10)));
  }

  const crossIds = await db.collection(COLLECTION_BY_KIND.Supplier).aggregate([
    { $lookup: { from: COLLECTION_BY_KIND.Customer, localField: '_id', foreignField: '_id', as: 'c' } },
    { $lookup: { from: COLLECTION_BY_KIND.Agent, localField: '_id', foreignField: '_id', as: 'a' } },
    { $match: { $or: [{ 'c.0': { $exists: true } }, { 'a.0': { $exists: true } }] } },
    { $count: 'n' },
  ]).toArray();
  const sharedAgentCustomer = await db.collection(COLLECTION_BY_KIND.Agent).aggregate([
    { $lookup: { from: COLLECTION_BY_KIND.Customer, localField: '_id', foreignField: '_id', as: 'c' } },
    { $match: { 'c.0': { $exists: true } } }, { $count: 'n' },
  ]).toArray();
  const shared = (crossIds[0]?.n || 0) + (sharedAgentCustomer[0]?.n || 0);
  log('  ' + (shared === 0 ? 'ok  ' : 'NOTE') + ' _ids present in more than one of the three collections: ' + shared);

  return { ok, byKind };
}

/* Every stored reference, resolved against the collection its kind now lives
   in - and against `contact`, so an orphan the split introduced is told apart
   from one that was already there. Read only; nothing is repaired. */
const REFERENCES = [
  ['grc', 'supplierId', 'Supplier'], ['grc', 'agentId', 'Agent'],
  ['grt', 'supplierId', 'Supplier'], ['grt', 'items.supplierId', 'Supplier'], ['grt', 'agentId', 'Agent'],
  ['delivery', 'supplierId', 'Supplier'],
  ['purchaseinvoice', 'supplierId', 'Supplier'], ['purchaseinvoice', 'agentId', 'Agent'],
  ['debitnote', 'supplierId', 'Supplier'], ['debitnote', 'agentId', 'Agent'],
  ['logistic', 'supplierId', 'Supplier'],
  ['barcodeLabel', 'supplierId', 'Supplier'],
  ['icautopurchasereturn', 'supplierId', 'Supplier'], ['icautopurchasereturn', 'agentId', 'Agent'], ['icautopurchasereturn', 'salesPersonId', 'Agent'],
  ['icdeliverychallan', 'agentId', 'Agent'], ['icdeliverychallan', 'salesPersonId', 'Agent'],
  ['deliverychallan', 'customerId', 'Customer'], ['deliverychallan', 'agentId', 'Agent'], ['deliverychallan', 'salesPersonId', 'Agent'],
  ['salesinvoice', 'customerId', 'Customer'], ['salesreturn', 'customerId', 'Customer'],
  ['posinvoice', 'customerId', 'Customer'], ['posinvoice', 'items.salesPerson', 'Agent'],
  ['posreturn', 'customerId', 'Customer'], ['poshold', 'customerId', 'Customer'],
  [COLLECTION_BY_KIND.Supplier, 'agentId', 'Agent'],
  [COLLECTION_BY_KIND.Customer, 'agentId', 'Agent'],
];

async function checkReferences() {
  hr('REFERENCES - every stored id, resolved in its kind\'s collection');
  const idsOf = async (collection) => new Set((await db.collection(collection).find({}, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
  const inKind = Object.fromEntries(await Promise.all(CONTACT_KINDS.map(async (k) => [k, await idsOf(COLLECTION_BY_KIND[k])])));
  const inLegacy = await idsOf(LEGACY_CONTACT_COLLECTION);
  const summary = { Supplier: { refs: 0, orphan: 0, introduced: 0 }, Customer: { refs: 0, orphan: 0, introduced: 0 }, Agent: { refs: 0, orphan: 0, introduced: 0 } };
  const introduced = [];

  for (const [collection, field, kind] of REFERENCES) {
    const [head, sub] = field.split('.');
    let refs = 0; let resolved = 0; let orphan = 0; let wasOrphan = 0;
    for await (const d of db.collection(collection).find({}, { projection: { [head]: 1 } })) {
      const values = sub
        ? (Array.isArray(d[head]) ? d[head].map((x) => x?.[sub]) : [])
        : [d[head]];
      for (const v of values) {
        if (v === null || v === undefined || v === '') continue;
        const id = String(v);
        if (!/^[0-9a-f]{24}$/i.test(id)) continue;
        refs += 1;
        if (inKind[kind].has(id)) { resolved += 1; continue; }
        orphan += 1;
        if (inLegacy.has(id)) introduced.push({ collection, field, _id: String(d._id), ref: id });
        else wasOrphan += 1;
      }
    }
    summary[kind].refs += refs; summary[kind].orphan += orphan; summary[kind].introduced += orphan - wasOrphan;
    if (refs) {
      log('  ' + ((orphan - wasOrphan) === 0 ? 'ok  ' : 'FAIL') + ' ' + (collection + '.' + field).padEnd(38) + ' -> ' +
        COLLECTION_BY_KIND[kind].padEnd(8) + ' refs ' + String(refs).padStart(6) + '  resolved ' + String(resolved).padStart(6) +
        '  orphan ' + String(orphan).padStart(5) + ' (already orphaned before the split: ' + wasOrphan + ')');
    }
  }
  log('');
  for (const kind of CONTACT_KINDS) {
    log('  ' + kind.padEnd(8) + ' orphan references: ' + summary[kind].orphan + '   introduced by the split: ' + summary[kind].introduced);
  }
  if (introduced.length) log('  INTRODUCED: ' + JSON.stringify(introduced.slice(0, 20)));
  return { summary, introducedCount: introduced.length };
}

/* ---------------------------------------------------------------- main --- */

const started = new Date();
let exitCode = 0;
try {
  hr('CONTACT SPLIT  -  ' + (ROLLBACK ? 'ROLLBACK ' : '') + (PRUNE ? 'PRUNE ' : '') + (VERIFY_ONLY ? 'VERIFY (read only)' : APPLY ? 'APPLY' : 'DRY RUN (nothing is written)') + '  -  database ' + db.databaseName);

  if (VERIFY_ONLY) {
    const v = await verifySplit();
    const refs = await checkReferences();
    exitCode = v.ok && refs.introducedCount === 0 ? 0 : 1;
  } else if (PRUNE) {
    /* ---------------------------------------------------------- prune --
       Removes COPIES from the split collections whose record `contact` no
       longer holds - a record deleted through the old screens after it was
       copied, or a throwaway test record copied mid-test and then cleaned up
       by its own test. `contact` itself is never touched.

       Only while the application still reads and writes `contact`: until
       then nothing but this script writes to the split collections, so a
       copy with no source is necessarily stale. Once CONTACT_STORAGE=split a
       record absent from `contact` may simply be new, and this refuses.

       Belt and braces: only copies that already existed when the last
       completed run finished are eligible - anything newer is reported and
       left - and every removed copy is written to backups/ first. */
    if (isSplitContactStorage()) {
      throw new Error('--prune refused: CONTACT_STORAGE=split, so the application writes to the split collections and a record missing from `contact` may be new. Nothing was removed.');
    }
    const previous = await runRecord();
    if (!previous?.lastCompletedFinishedAt) throw new Error('--prune refused: no completed forward run is recorded yet.');
    const cutoff = new Date(previous.lastCompletedFinishedAt).getTime();
    hr('PRUNE - copies whose source record `contact` no longer holds' + (APPLY ? '' : ' (dry run)'));
    const pruned = [];
    for (const kind of CONTACT_KINDS) {
      const target = COLLECTION_BY_KIND[kind];
      const sourceIds = new Set((await legacy.find({ contactKind: kind }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
      const stale = []; const tooNew = [];
      for await (const d of db.collection(target).find({})) {
        if (sourceIds.has(String(d._id))) continue;
        const touched = Math.max(time(d.updatedAt) ?? 0, time(d.createdAt) ?? 0);
        (touched && touched <= cutoff ? stale : tooNew).push(d);
      }
      log('  ' + target.padEnd(9) + ' no longer in contact: ' + (stale.length + tooNew.length) + '  -> ' + (APPLY ? 'removing ' : 'would remove ') + stale.length + ', left because newer than the last run: ' + tooNew.length);
      for (const d of stale) log('    ' + String(d._id) + '  ' + (d.contactId || '-') + '  ' + JSON.stringify(d.businessName || [d.firstName, d.lastName].filter(Boolean).join(' ')) + '  business ' + String(d.businessId) + '  updated ' + (d.updatedAt?.toISOString?.() || d.updatedAt));
      for (const d of tooNew) log('    LEFT ' + String(d._id) + '  ' + (d.contactId || '-') + '  updated ' + (d.updatedAt?.toISOString?.() || d.updatedAt));
      pruned.push(...stale.map((d) => ({ target, doc: d })));
    }
    if (APPLY && pruned.length) {
      const file = path.join(ROOT, 'backups', 'split-copies-pruned-' + stamp + '.ndjson');
      fs.writeFileSync(file, pruned.map(({ target, doc }) => EJSON.stringify({ collection: target, doc }, { relaxed: false })).join('\n') + '\n');
      log('  backup  ' + path.relative(ROOT, file) + '  ' + pruned.length + ' copies');
      for (const kind of CONTACT_KINDS) {
        const target = COLLECTION_BY_KIND[kind];
        const ids = pruned.filter((p) => p.target === target).map((p) => p.doc._id);
        if (!ids.length) continue;
        /* guarded again at write time: still absent from contact */
        const reappeared = await legacy.countDocuments({ _id: { $in: ids } });
        if (reappeared) throw new Error(reappeared + ' of the ' + target + ' copies reappeared in contact during the prune - nothing removed from ' + target);
        const res = await db.collection(target).deleteMany({ _id: { $in: ids } });
        log('  removed ' + res.deletedCount + ' from ' + target);
      }
    }
    if (!APPLY) log('\n  Dry run - nothing was removed. Run again with --prune --apply.');
  } else if (ROLLBACK) {
    /* ------------------------------------------------------- rollback --
       Copy the three collections back into `contact`, stamped with their
       kind, so that reverting the application code (backups/code-before-
       contact-split-*.tgz) loses nothing created or edited since the split.
       Same guarded copy as the forward run; `contact` is backed up first. */
    if (APPLY) await backupCollection(LEGACY_CONTACT_COLLECTION);
    const results = {};
    for (const kind of CONTACT_KINDS) {
      results[kind] = await copyAcross({
        source: COLLECTION_BY_KIND[kind],
        targetOf: () => LEGACY_CONTACT_COLLECTION,
        classify: (doc) => (doc.contactKind === kind ? {} : { error: 'record in ' + COLLECTION_BY_KIND[kind] + ' is marked ' + JSON.stringify(doc.contactKind), fields: ['contactKind'] }),
        watermark: null,
        label: COLLECTION_BY_KIND[kind] + ' -> contact',
      });
    }
    hr('ROLLBACK SUMMARY' + (APPLY ? '' : ' (dry run)'));
    for (const [kind, r] of Object.entries(results)) {
      log('  ' + kind.padEnd(8) + ' read ' + r.totals.read + '  insert ' + r.totals.insert + '  refresh ' + r.totals.refresh + '  unchanged ' + r.totals.skip + '  conflicts ' + r.totals.conflict + '  errors ' + r.totals.error);
      if (r.errors.length) log('    errors: ' + JSON.stringify(r.errors.slice(0, 20)));
      if (r.conflicts.length) log('    conflicts: ' + JSON.stringify(r.conflicts.slice(0, 20)));
      if (r.totals.error || r.totals.conflict) exitCode = 1;
    }
    if (APPLY) log('\n  `contact` now holds every record. Restore the code from backups/code-before-contact-split-*.tgz to switch the application back.');
  } else {
    /* -------------------------------------------------------- forward -- */
    const previous = await runRecord();
    const watermark = previous?.lastCompletedStartedAt
      ? new Date(previous.lastCompletedStartedAt).getTime() - WATERMARK_SKEW_MS
      : null;

    hr('1. SOURCE');
    const total = await legacy.countDocuments();
    const kinds = await legacy.aggregate([{ $group: { _id: '$contactKind', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
    log('  contact documents: ' + total);
    for (const k of kinds) log('    ' + String(k._id).padEnd(10) + ' ' + k.n + (CONTACT_KINDS.includes(k._id) ? '  -> ' + COLLECTION_BY_KIND[k._id] : '  -> NOT MIGRATED (unknown kind)'));
    log('  multi-role records: none possible - contactKind is a single value per record,');
    log('    and no contactId is shared between two records (checked below)');
    const sharedCodes = await legacy.aggregate([
      { $match: { contactId: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$contactId', kinds: { $addToSet: '$contactKind' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } }, { $count: 'n' },
    ]).toArray();
    log('    contact codes carried by more than one record: ' + (sharedCodes[0]?.n || 0));
    log('  previous completed run: ' + (previous?.lastCompletedStartedAt ? new Date(previous.lastCompletedStartedAt).toISOString() + ' (records untouched since then and absent from a target are treated as deleted there, not re-copied)' : 'none - first run'));

    let backup = null;
    if (APPLY) {
      hr('2. BACKUP');
      backup = await backupCollection(LEGACY_CONTACT_COLLECTION);

      hr('3. INDEXES');
      /* createIndexes() builds exactly the indexes each model declares - the
         ones the app will ask for - so the app never finds a conflicting
         spec. It never drops an index (that would be syncIndexes). */
      for (const [kind, Model] of Object.entries(MODELS)) {
        await Model.createIndexes();
        const idx = await db.collection(COLLECTION_BY_KIND[kind]).indexes();
        log('  ' + COLLECTION_BY_KIND[kind].padEnd(9) + idx.map((i) => i.name).join(', '));
      }
    }

    hr(APPLY ? '4. COPY' : '2. WHAT WOULD BE COPIED');
    const result = await copyAcross({
      source: LEGACY_CONTACT_COLLECTION,
      targetOf: (doc) => COLLECTION_BY_KIND[doc.contactKind],
      classify: classifyForward,
      watermark,
      label: 'contact -> supplier / customer / agent',
    });
    for (const [target, t] of Object.entries(result.perTarget)) {
      log('  ' + target.padEnd(9) + ' ' + (APPLY ? 'inserted ' : 'would insert ') + t.insert + ', ' + (APPLY ? 'refreshed ' : 'would refresh ') + t.refresh +
        ', unchanged ' + t.skip + ', conflicts ' + t.conflict + ', errors ' + t.error + ', not brought back ' + t.notResurrected);
    }
    if (result.errors.length) { log('\n  MIGRATION ERRORS (' + result.errors.length + '):'); result.errors.slice(0, 50).forEach((e) => log('    ID ' + e._id + '  type ' + e.contactKind + '  reason: ' + e.reason + (e.fields.length ? '  fields: ' + e.fields.join(', ') : ''))); }
    if (result.conflicts.length) { log('\n  CONFLICTS (' + result.conflicts.length + ', left untouched):'); result.conflicts.slice(0, 50).forEach((c) => log('    ID ' + c._id + '  ' + c.target + '  ' + c.reason + '  fields: ' + c.fields.join(', '))); }
    if (result.notResurrected.length) { log('\n  NOT BROUGHT BACK - absent from their target and unchanged in contact since the last run (deleted through the new screens):'); result.notResurrected.slice(0, 50).forEach((n) => log('    ID ' + n._id + '  ' + n.target)); }
    if (result.totals.error || result.totals.conflict) exitCode = 1;

    if (APPLY) {
      const v = await verifySplit();
      const refs = await checkReferences();
      if (!v.ok || refs.introducedCount) exitCode = 1;

      /* the run record: when this run STARTED is the watermark for the next */
      if (exitCode === 0) {
        await db.collection(RUN_COLLECTION).updateOne(
          { _id: RUN_DOC_ID },
          {
            $set: { lastCompletedStartedAt: started, lastCompletedFinishedAt: new Date() },
            $push: { runs: { startedAt: started, finishedAt: new Date(), backup: backup?.file, totals: result.totals, perTarget: result.perTarget } },
          },
          { upsert: true }
        );
        log('\n  run recorded in ' + RUN_COLLECTION + ' { _id: "' + RUN_DOC_ID + '" }');
      } else {
        log('\n  NOT recorded as a completed run - fix the problems above and run again.');
      }
    } else {
      log('\n  Dry run - nothing was written. Run again with --apply to back up and copy.');
    }
  }
} catch (err) {
  console.error('\nFAILED:', err);
  exitCode = 1;
} finally {
  await mongoose.disconnect();
}
process.exit(exitCode);
