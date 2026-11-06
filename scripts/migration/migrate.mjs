#!/usr/bin/env node
/**
 * Idempotent, resumable Atlas -> self-hosted MongoDB migration.
 *
 * Default is a READ-ONLY dry run. Writes require ALL of:
 *   --apply --yes --include-barcode-label   (or --exclude-barcode-label)
 *
 * Guarantees:
 *   - original _id values and BSON types are preserved (insertMany of raw docs)
 *   - existing target documents are never overwritten; a differing _id aborts
 *   - per-collection index migration after data, with conflicts reported, never dropped
 *   - excluded POS / BarcodeLabel collections are never created or written
 *   - checkpoint after every batch; rerunning resumes from the last committed _id
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import { buildModelCatalog } from './lib/model-catalog.mjs';
import { classifyCollection } from './lib/classification.mjs';
import { bsonHash, canonical, decodeId, describeDifference, encodeId, idKey } from './lib/bson-utils.mjs';

const { MongoClient, BSON } = mongodb;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const OUT_DIR = path.join(__dirname, 'out');
const CHECKPOINT = path.join(OUT_DIR, 'checkpoint.json');
const ERROR_LOG = path.join(ROOT, 'mongodb-migration-errors.log');

const options = parseArgs(process.argv.slice(2));
const sourceUri = process.env.SOURCE_MONGODB_URI || '';
const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const sourceDbName = process.env.SOURCE_DB_NAME || 'test';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
if (!sourceUri) throw new Error('SOURCE_MONGODB_URI is not set');
if (!targetUri) throw new Error('TARGET_MONGODB_URI is not set');

function parseArgs(argv) {
  const out = {
    apply: false,
    yes: false,
    includeBarcodeLabel: false,
    excludeBarcodeLabel: false,
    batchSize: 500,
    collection: '',
    resetCheckpoint: false,
    allowNonEmptyTarget: false,
    skipIndexes: false,
    sync: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') out.apply = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--include-barcode-label') out.includeBarcodeLabel = true;
    else if (arg === '--exclude-barcode-label') out.excludeBarcodeLabel = true;
    else if (arg === '--reset-checkpoint') out.resetCheckpoint = true;
    else if (arg === '--allow-nonempty-target') out.allowNonEmptyTarget = true;
    else if (arg === '--skip-indexes') out.skipIndexes = true;
    else if (arg === '--sync') out.sync = true;
    else if (arg.startsWith('--batch-size=')) out.batchSize = Math.max(1, Math.min(5000, Number(arg.split('=')[1]) || 500));
    else if (arg.startsWith('--collection=')) out.collection = arg.split('=')[1];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node --env-file=.env scripts/migration/migrate.mjs [--apply --yes --include-barcode-label|--exclude-barcode-label] [--batch-size=500] [--collection=name] [--reset-checkpoint] [--skip-indexes] [--sync]');
      console.log('  --sync  Rescan every included collection from the beginning, insert only _ids that are missing, and abort on any differing existing document. Safe to rerun.');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (out.includeBarcodeLabel && out.excludeBarcodeLabel) {
    throw new Error('Choose only one of --include-barcode-label or --exclude-barcode-label');
  }
  return out;
}

function redactedHost(uri) {
  try { return new URL(uri).host; } catch { return '(unparseable)'; }
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function appendError(line) {
  ensureDir(path.dirname(ERROR_LOG));
  fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
}

function loadCheckpoint() {
  if (options.resetCheckpoint && fs.existsSync(CHECKPOINT)) {
    fs.renameSync(CHECKPOINT, `${CHECKPOINT}.reset-${Date.now()}`);
  }
  if (!fs.existsSync(CHECKPOINT)) return { version: 1, createdAt: new Date().toISOString(), collections: {} };
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  } catch (e) {
    throw new Error(`Checkpoint is unreadable: ${e.message}. Move ${CHECKPOINT} aside to restart.`);
  }
}

function saveCheckpoint(checkpoint) {
  ensureDir(OUT_DIR);
  checkpoint.updatedAt = new Date().toISOString();
  const tmp = CHECKPOINT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(tmp, CHECKPOINT);
}

async function connect(uri, { direct = false } = {}) {
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-runner',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    maxPoolSize: 4,
    ...(direct ? { directConnection: true } : {}),
  });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  return client;
}

function collectionOptions(sourceInfo) {
  const raw = sourceInfo?.options || {};
  const allowed = [
    'capped', 'size', 'max', 'validator', 'validationLevel', 'validationAction',
    'collation', 'timeseries', 'expireAfterSeconds', 'clusteredIndex',
    'changeStreamPreAndPostImages', 'viewOn', 'pipeline',
  ];
  const opts = {};
  for (const key of allowed) if (raw[key] !== undefined) opts[key] = raw[key];
  return opts;
}

async function ensureCollection(db, name, sourceInfo, errors) {
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length) return { created: false, view: Boolean(sourceInfo?.options?.viewOn) };
  if (sourceInfo?.options?.viewOn) {
    try {
      await db.createCollection(name, collectionOptions(sourceInfo));
      return { created: true, view: true };
    } catch (e) {
      errors.push(`${name}: could not create view: ${e.message}`);
      appendError(`${name}: view creation failed: ${e.message}`);
      return { created: false, view: true };
    }
  }
  try {
    await db.createCollection(name, collectionOptions(sourceInfo));
    return { created: true, view: false };
  } catch (e) {
    if (e.code === 48) return { created: false, view: false }; // NamespaceExists
    // Retry without optional options; data insertion can still proceed.
    appendError(`${name}: collection options rejected (${e.message}); retrying with defaults`);
    try {
      await db.createCollection(name);
      return { created: true, view: false };
    } catch (e2) {
      if (e2.code === 48) return { created: false, view: false };
      errors.push(`${name}: could not create collection: ${e2.message}`);
      appendError(`${name}: collection creation failed: ${e2.message}`);
      return { created: false, view: false };
    }
  }
}

async function processBatch({ sourceDocs, targetCol, state, counters, trackLastId, collectionName, checkpoint, errors }) {
  const ids = sourceDocs.map((d) => d._id);
  const existing = await targetCol.find({ _id: { $in: ids } }).toArray();
  const existingByKey = new Map(existing.map((d) => [idKey(d._id), d]));
  const missing = [];
  const conflicts = [];

  for (const sourceDoc of sourceDocs) {
    const targetDoc = existingByKey.get(idKey(sourceDoc._id));
    if (!targetDoc) {
      missing.push(sourceDoc);
      continue;
    }
    if (bsonHash(targetDoc) === bsonHash(sourceDoc)) {
      counters.existing = (counters.existing || 0) + 1;
    } else {
      conflicts.push({ sourceDoc, targetDoc, diff: describeDifference(sourceDoc, targetDoc) });
    }
  }

  if (conflicts.length) {
    state.status = 'conflict';
    counters.conflicts = (counters.conflicts || 0) + conflicts.length;
    saveCheckpoint(checkpoint);
    for (const c of conflicts.slice(0, 20)) {
      const line = `${collectionName}: CONFLICT _id=${encodeId(c.sourceDoc._id)} onlySource=[${c.diff.onlySource}] onlyTarget=[${c.diff.onlyTarget}] changed=[${c.diff.changed}]`;
      errors.push(line);
      appendError(line);
    }
    appendError(`${collectionName}: ${conflicts.length} conflicting document(s); batch not inserted. Migration stopped.`);
    throw new Error(`Existing target document differs from source in ${collectionName}; refusing to overwrite. See ${ERROR_LOG}`);
  }

  if (missing.length) {
    try {
      const result = await targetCol.insertMany(missing, { ordered: false });
      counters.inserted = (counters.inserted || 0) + (result.insertedCount || missing.length);
    } catch (e) {
      if (e?.code === 11000 || e?.writeErrors?.length) {
        const inserted = e.result?.insertedCount || 0;
        counters.inserted = (counters.inserted || 0) + inserted;
        for (const writeError of e.writeErrors || []) {
          if (writeError.code !== 11000) {
            state.status = 'failed';
            saveCheckpoint(checkpoint);
            const line = `${collectionName}: insert error at batch index ${writeError.index}: ${writeError.errmsg || writeError.message}`;
            errors.push(line);
            appendError(line);
            throw e;
          }
          // A concurrent insert hit an _id we just checked. Compare and treat
          // identical as already-existing, differing as a conflict.
          const doc = missing[writeError.index];
          const targetDoc = await targetCol.findOne({ _id: doc._id });
          if (!targetDoc) {
            state.status = 'failed';
            saveCheckpoint(checkpoint);
            const line = `${collectionName}: duplicate-key error but no target document found for _id=${encodeId(doc._id)}`;
            errors.push(line);
            appendError(line);
            throw e;
          }
          if (bsonHash(targetDoc) === bsonHash(doc)) {
            counters.existing = (counters.existing || 0) + 1;
          } else {
            state.status = 'conflict';
            counters.conflicts = (counters.conflicts || 0) + 1;
            saveCheckpoint(checkpoint);
            const diff = describeDifference(doc, targetDoc);
            const line = `${collectionName}: CONFLICT _id=${encodeId(doc._id)} onlySource=[${diff.onlySource}] onlyTarget=[${diff.onlyTarget}] changed=[${diff.changed}]`;
            errors.push(line);
            appendError(line);
            throw new Error(`Existing target document differs from source in ${collectionName}; refusing to overwrite.`);
          }
        }
      } else {
        state.status = 'failed';
        saveCheckpoint(checkpoint);
        errors.push(`${collectionName}: batch insert failed: ${e.message}`);
        appendError(`${collectionName}: batch insert failed: ${e.message}`);
        throw e;
      }
    }
  }

  counters.scanned = (counters.scanned || 0) + sourceDocs.length;
  if (trackLastId) state.lastId = encodeId(sourceDocs[sourceDocs.length - 1]._id);
  counters.batches = (counters.batches || 0) + 1;
  saveCheckpoint(checkpoint);
}

async function migrateCollection({ collectionName, sourceDb, targetDb, sourceInfo, checkpoint, errors }) {
  const state = checkpoint.collections[collectionName] || {
    status: 'pending',
    lastId: null,
    scanned: 0,
    inserted: 0,
    existing: 0,
    conflicts: 0,
    batches: 0,
    startedAt: new Date().toISOString(),
  };
  checkpoint.collections[collectionName] = state;

  const syncMode = options.sync;
  const completedBefore = state.status === 'complete' || Boolean(state.completedAt);
  const rescanComplete = syncMode && completedBefore;
  if (state.status === 'complete' && !syncMode) {
    return { ...state, skipped: true };
  }
  if (state.status === 'conflict' || state.status === 'failed') {
    throw new Error(`${collectionName} is marked ${state.status} in the checkpoint. Resolve it, or move ${CHECKPOINT} aside to restart.`);
  }

  // Normal migration keeps its original counters. A sync of an already-complete
  // collection writes to a separate `sync` block so the first migration's
  // evidence (scanned/inserted counts, duration) is never rewritten.
  const counters = rescanComplete ? (state.sync ||= {}) : state;
  if (syncMode && rescanComplete) {
    Object.assign(counters, {
      runs: (counters.runs || 0) + 1,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      scanned: 0,
      inserted: 0,
      existing: 0,
      conflicts: 0,
      batches: 0,
      sourceCount: null,
      targetCountBefore: null,
      targetCountAfter: null,
      sourceCountAfter: null,
    });
  } else if (syncMode) {
    // A new or previously incomplete collection is still synced from the
    // beginning; its normal counters become the sync counters.
    state.syncRun = (state.syncRun || 0) + 1;
  }

  const sourceCol = sourceDb.collection(collectionName);
  const targetCol = targetDb.collection(collectionName);
  const sourceCount = await sourceCol.countDocuments();
  if (rescanComplete) {
    counters.sourceCount = sourceCount;
    counters.targetCountBefore = await targetCol.countDocuments();
  } else {
    state.sourceCount = sourceCount;
    state.status = 'running';
  }
  saveCheckpoint(checkpoint);

  const sourceCollectionInfo = sourceInfo;
  const { view } = await ensureCollection(targetDb, collectionName, sourceCollectionInfo, errors);
  if (view) {
    state.status = 'view-skipped';
    if (rescanComplete) {
      counters.status = 'view-skipped';
      counters.finishedAt = new Date().toISOString();
    }
    state.note = 'Source is a view; no documents were copied. Definition copied if possible.';
    saveCheckpoint(checkpoint);
    return state;
  }

  const startCounters = {
    scanned: counters.scanned || 0,
    inserted: counters.inserted || 0,
    existing: counters.existing || 0,
    conflicts: counters.conflicts || 0,
  };

  // In sync mode every collection is rescanned from the first _id. The target
  // _id check makes this idempotent: identical documents are counted as
  // existing, missing documents are inserted, and any difference aborts.
  const filter = syncMode ? {} : (state.lastId ? { _id: { $gt: decodeId(state.lastId) } } : {});
  let batch = [];
  let batchBytes = 0;
  // Cap both document count and BSON payload size. MongoDB's wire command
  // limit is 48 MB; 16 MB leaves ample room for the command envelope.
  const MAX_BATCH_BYTES = 16 * 1024 * 1024;
  const cursor = sourceCol.find(filter, { batchSize: options.batchSize }).sort({ _id: 1 });
  for await (const doc of cursor) {
    batch.push(doc);
    batchBytes += BSON.calculateObjectSize(doc);
    if (batch.length >= options.batchSize || batchBytes >= MAX_BATCH_BYTES) {
      await processBatch({
        sourceDocs: batch,
        targetCol,
        state,
        counters,
        trackLastId: !rescanComplete,
        collectionName,
        checkpoint,
        errors,
      });
      batch = [];
      batchBytes = 0;
      if (counters.batches % 10 === 0) {
        console.log(`  ${collectionName}: scanned ${counters.scanned} / ${sourceCount}`);
      }
    }
  }
  if (batch.length) {
    await processBatch({
      sourceDocs: batch,
      targetCol,
      state,
      counters,
      trackLastId: !rescanComplete,
      collectionName,
      checkpoint,
      errors,
    });
  }

  const run = {
    scanned: (counters.scanned || 0) - startCounters.scanned,
    inserted: (counters.inserted || 0) - startCounters.inserted,
    existing: (counters.existing || 0) - startCounters.existing,
    conflicts: (counters.conflicts || 0) - startCounters.conflicts,
  };

  const targetCount = await targetCol.countDocuments();
  const sourceCountAfter = await sourceCol.countDocuments();
  if (rescanComplete) {
    counters.targetCountAfter = targetCount;
    counters.sourceCountAfter = sourceCountAfter;
    counters.finishedAt = new Date().toISOString();
    if (targetCount === sourceCountAfter) {
      counters.status = 'complete';
      state.status = 'complete';
    } else {
      counters.status = 'incomplete';
      state.status = 'incomplete';
      const line = `${collectionName}: sync count mismatch: source=${sourceCountAfter} target=${targetCount}. No target documents were deleted.`;
      errors.push(line);
      appendError(line);
    }
  } else {
    state.targetCount = targetCount;
    state.sourceCountAfter = sourceCountAfter;
    if (targetCount === sourceCountAfter) {
      state.status = 'complete';
      state.completedAt = new Date().toISOString();
    } else {
      state.status = 'incomplete';
      const line = `${collectionName}: count mismatch after copy: source=${state.sourceCountAfter} target=${targetCount}. Not marked complete.`;
      errors.push(line);
      appendError(line);
    }
  }
  saveCheckpoint(checkpoint);
  return { ...state, run };
}

function cleanIndex(index) {
  const out = { key: index.key, name: index.name };
  const keys = [
    'unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation',
    'weights', 'default_language', 'language_override', 'textIndexVersion',
    '2dsphereIndexVersion', 'bits', 'min', 'max', 'bucketSize', 'wildcardProjection',
    'hidden', 'storageEngine',
  ];
  for (const key of keys) if (index[key] !== undefined) out[key] = index[key];
  return out;
}

function indexSignature(index) {
  const cleaned = cleanIndex(index);
  return JSON.stringify(cleaned);
}

async function migrateIndexes({ collectionName, sourceDb, targetDb, errors }) {
  const sourceIndexes = (await sourceDb.collection(collectionName).listIndexes().toArray()).filter((i) => i.name !== '_id_');
  if (!sourceIndexes.length) return { created: 0, skipped: 0, conflicts: 0 };
  const targetIndexes = await targetDb.collection(collectionName).listIndexes().toArray();
  const targetByName = new Map(targetIndexes.map((i) => [i.name, i]));
  let created = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const sourceIndex of sourceIndexes) {
    const existing = targetByName.get(sourceIndex.name);
    if (existing) {
      if (indexSignature(existing) === indexSignature(sourceIndex)) {
        skipped++;
      } else {
        conflicts++;
        const line = `${collectionName}: INDEX CONFLICT ${sourceIndex.name}; target differs. Not dropped or recreated.`;
        errors.push(line);
        appendError(line);
      }
      continue;
    }
    // Same key under another name: MongoDB refuses a second index with the
    // same key pattern. Compare and report instead of dropping anything.
    const sameKey = targetIndexes.find((i) => i.name !== '_id_' && JSON.stringify(i.key) === JSON.stringify(sourceIndex.key));
    if (sameKey) {
      if (indexSignature(sameKey) === indexSignature({ ...sourceIndex, name: sameKey.name })) {
        skipped++;
      } else {
        conflicts++;
        const line = `${collectionName}: INDEX CONFLICT key ${JSON.stringify(sourceIndex.key)} exists as ${sameKey.name} with different options.`;
        errors.push(line);
        appendError(line);
      }
      continue;
    }
    try {
      await targetDb.collection(collectionName).createIndexes([cleanIndex(sourceIndex)]);
      targetIndexOf(sourceIndex.name, targetByName, sourceIndex);
      created++;
    } catch (e) {
      if (e.code === 85 || e.code === 86 || /already exists/i.test(e.message)) {
        conflicts++;
        const line = `${collectionName}: INDEX CONFLICT ${sourceIndex.name}: ${e.message}`;
        errors.push(line);
        appendError(line);
      } else {
        conflicts++;
        const line = `${collectionName}: INDEX CREATE FAILED ${sourceIndex.name}: ${e.message}`;
        errors.push(line);
        appendError(line);
      }
    }
  }
  return { created, skipped, conflicts };
}

function targetIndexOf(name, map, fallback) {
  map.set(name, fallback);
}

async function main() {
  if (options.apply && (!options.yes || (!options.includeBarcodeLabel && !options.excludeBarcodeLabel))) {
    console.error('Refusing to write. Apply requires --apply --yes and an explicit --include-barcode-label or --exclude-barcode-label.');
    process.exit(2);
  }

  const catalog = buildModelCatalog();
  const catalogByCollection = new Map(catalog.map((e) => [e.collection, e]));
  const source = await connect(sourceUri);
  const target = await connect(targetUri, { direct: true });
  const sourceDb = source.db(sourceDbName);
  const targetDb = target.db(targetDbName);

  const sourceInfos = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const targetInfos = await targetDb.listCollections({}, { nameOnly: false }).toArray();
  const targetByName = new Map(targetInfos.map((i) => [i.name, i]));
  const targetNonEmpty = targetInfos.length > 0;

  if (options.apply && targetNonEmpty && !options.allowNonEmptyTarget) {
    console.error(`Target database ${targetDbName} already has ${targetInfos.length} collection(s). Refusing to write without --allow-nonempty-target. Create/verify the backup first.`);
    process.exit(2);
  }

  const includeBarcodeLabel = options.includeBarcodeLabel ? true : options.excludeBarcodeLabel ? false : null;
  const plan = [];
  for (const info of sourceInfos.sort((a, b) => a.name.localeCompare(b.name))) {
    if (options.collection && info.name !== options.collection) continue;
    const classification = classifyCollection(info.name, { includeBarcodeLabel });
    if (classification.status === 'EXCLUDE') continue;
    if (classification.status === 'DECISION') continue; // handled below
    const count = await sourceDb.collection(info.name).countDocuments();
    const indexes = await sourceDb.collection(info.name).listIndexes().toArray();
    const targetCount = options.sync
      ? (targetByName.has(info.name) ? await targetDb.collection(info.name).countDocuments() : 0)
      : null;
    plan.push({
      name: info.name,
      sourceCount: count,
      targetCount,
      missingCount: targetCount === null ? null : Math.max(0, count - targetCount),
      indexes: indexes.length,
      model: catalogByCollection.get(info.name)?.modelNames?.join(', ') || '—',
      module: catalogByCollection.get(info.name)?.module || 'legacy/external',
      classification,
      info,
    });
  }

  const decisionRow = sourceInfos.find((i) => i.name === 'barcodeLabel');
  const decisionClass = classifyCollection('barcodeLabel', { includeBarcodeLabel });
  if (decisionRow && decisionClass.status === 'DECISION') {
    const count = await sourceDb.collection('barcodeLabel').countDocuments();
    console.log(`DECISION REQUIRED: barcodeLabel has ${count} documents. Add --include-barcode-label (recommended) or --exclude-barcode-label.`);
  }

  const totalDocs = plan.reduce((n, p) => n + p.sourceCount, 0);
  const totalIndexes = plan.reduce((n, p) => n + p.indexes, 0);
  const totalMissing = plan.reduce((n, p) => n + (p.missingCount || 0), 0);
  console.log(`Source: ${sourceDbName} at ${redactedHost(sourceUri)} | ${sourceInfos.length} collections`);
  console.log(`Target: ${targetDbName} at ${redactedHost(targetUri)} | ${targetInfos.length} collections | ${targetNonEmpty ? 'NON-EMPTY' : 'empty'}`);
  console.log(`Plan: ${plan.length} collections, ${totalDocs} documents, ${totalIndexes} indexes`);
  if (options.sync) {
    console.log(`Sync delta: ${totalMissing} document(s) missing in target across ${plan.filter((p) => p.missingCount > 0).length} collection(s).`);
  }
  console.log(`Excluded (POS + barcodeLabel decision): ${sourceInfos.length - plan.length} collections`);

  if (!options.apply) {
    for (const p of plan) {
      if (options.sync) {
        console.log(`  ${p.name.padEnd(32)} source=${String(p.sourceCount).padStart(7)} target=${String(p.targetCount).padStart(7)} toInsert=${String(p.missingCount).padStart(6)}  ${p.module}`);
      } else {
        console.log(`  ${p.name.padEnd(32)} ${String(p.sourceCount).padStart(7)} docs  ${String(p.indexes).padStart(2)} idx  ${p.module}`);
      }
    }
    console.log(options.sync
      ? 'SYNC DRY RUN — nothing written. Add --apply --yes with a barcodeLabel decision to insert missing documents.'
      : 'DRY RUN — nothing written. Add --apply --yes with a barcodeLabel decision to execute.');
    await source.close();
    await target.close();
    return;
  }

  const errors = [];
  const checkpoint = loadCheckpoint();
  checkpoint.sourceDb = sourceDbName;
  checkpoint.targetDb = targetDbName;
  checkpoint.includeBarcodeLabel = includeBarcodeLabel;
  saveCheckpoint(checkpoint);

  const started = Date.now();
  const runTotals = { scanned: 0, inserted: 0, existing: 0, conflicts: 0 };
  try {
    for (const p of plan) {
      const before = Date.now();
      console.log(`${options.sync ? 'Syncing' : 'Migrating'} ${p.name} (${p.sourceCount} docs)...`);
      const state = await migrateCollection({
        collectionName: p.name,
        sourceDb,
        targetDb,
        sourceInfo: p.info,
        checkpoint,
        errors,
      });
      const run = state.run || { scanned: 0, inserted: 0, existing: 0, conflicts: 0 };
      for (const key of Object.keys(runTotals)) runTotals[key] += run[key] || 0;
      console.log(`  ${p.name}: ${state.status} inserted=${run.inserted} existing=${run.existing} scanned=${run.scanned} in ${((Date.now() - before) / 1000).toFixed(1)}s`);
    }

    if (!options.skipIndexes) {
      console.log('Migrating indexes...');
      for (const p of plan) {
        const result = await migrateIndexes({ collectionName: p.name, sourceDb, targetDb, errors });
        if (result.created || result.conflicts) {
          console.log(`  ${p.name}: indexes created=${result.created} skipped=${result.skipped} conflicts=${result.conflicts}`);
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const durationSeconds = Math.round((Date.now() - started) / 1000);
    const runRecord = {
      mode: options.sync ? 'sync' : 'migration',
      status: errors.length ? 'completed-with-errors' : 'complete',
      startedAt: new Date(started).toISOString(),
      finishedAt,
      durationSeconds,
      collections: plan.length,
      ...runTotals,
    };
    checkpoint.lastRun = runRecord;
    if (options.sync) {
      // Keep the original migration duration/finishedAt intact; sync has its own block.
      checkpoint.lastSync = runRecord;
    } else {
      checkpoint.finishedAt = finishedAt;
      checkpoint.durationSeconds = durationSeconds;
    }
    checkpoint.errors = errors;
    saveCheckpoint(checkpoint);
    console.log(`${options.sync ? 'Sync' : 'Migration'} finished in ${durationSeconds}s. scanned=${runTotals.scanned} inserted=${runTotals.inserted} existing=${runTotals.existing} errors=${errors.length}. Checkpoint: ${CHECKPOINT}`);
    if (errors.length) {
      console.log(`See ${ERROR_LOG}`);
      process.exitCode = 1;
    }
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationSeconds = Math.round((Date.now() - started) / 1000);
    checkpoint.lastRun = {
      mode: options.sync ? 'sync' : 'migration',
      status: 'failed',
      startedAt: new Date(started).toISOString(),
      finishedAt,
      durationSeconds,
      collections: plan.length,
      ...runTotals,
      error: error.message,
    };
    if (options.sync) checkpoint.lastSync = checkpoint.lastRun;
    checkpoint.errors = errors;
    checkpoint.fatal = error.message;
    saveCheckpoint(checkpoint);
    appendError(`FATAL: ${error.message}`);
    console.error('Migration stopped:', error.message);
    process.exitCode = 1;
  } finally {
    await source.close();
    await target.close();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
