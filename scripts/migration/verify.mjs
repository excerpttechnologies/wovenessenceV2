#!/usr/bin/env node
/**
 * Phase 6 verification and Phase 7 report generation.
 *
 * Read-only against both databases. Produces:
 *   - MONGODB_MIGRATION_RESULTS.md
 *   - mongodb-migration-report.json
 *   - mongodb-migration-errors.log
 *
 * Verification is not count-only: every target document is compared with its
 * source document using a canonical, BSON-type-aware SHA-256 hash, so an
 * ObjectId can never compare equal to its string form and a Decimal128 can
 * never compare equal to a double.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import { buildModelCatalog } from './lib/model-catalog.mjs';
import { POS_COLLECTIONS } from './lib/classification.mjs';
import { bsonHash, canonical, idKey } from './lib/bson-utils.mjs';
import '../aliasRegister.mjs';

const { MongoClient, BSON } = mongodb;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const OUT_DIR = path.join(__dirname, 'out');
const AUDIT_JSON = path.join(OUT_DIR, 'audit-data.json');
const CHECKPOINT_JSON = path.join(OUT_DIR, 'checkpoint.json');
const REPORT_JSON = path.join(ROOT, 'mongodb-migration-report.json');
const RESULTS_MD = path.join(ROOT, 'MONGODB_MIGRATION_RESULTS.md');
const ERROR_LOG = path.join(ROOT, 'mongodb-migration-errors.log');

const sourceUri = process.env.SOURCE_MONGODB_URI || '';
const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const sourceDbName = process.env.SOURCE_DB_NAME || 'test';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
if (!sourceUri) throw new Error('SOURCE_MONGODB_URI is not set');
if (!targetUri) throw new Error('TARGET_MONGODB_URI is not set');
if (!fs.existsSync(AUDIT_JSON)) throw new Error(`Audit data not found: ${AUDIT_JSON}. Run audit.mjs first.`);

const audit = JSON.parse(fs.readFileSync(AUDIT_JSON, 'utf8'));
const checkpoint = fs.existsSync(CHECKPOINT_JSON)
  ? JSON.parse(fs.readFileSync(CHECKPOINT_JSON, 'utf8'))
  : { collections: {}, errors: [] };

const includedRows = audit.rows.filter((row) => row.classification.status === 'INCLUDE');
const excludedRows = audit.rows.filter((row) => row.classification.status === 'EXCLUDE');
const includedSet = new Set(includedRows.map((row) => row.name));

function redactedHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return '(unparseable)';
  }
}

async function connect(uri, { direct = false } = {}) {
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-verify',
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

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

async function countDuplicateIdGroups(collection) {
  const rows = await collection.aggregate([
    { $group: { _id: '$_id', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 5 },
  ], { allowDiskUse: true }).toArray();
  return rows.length;
}

/**
 * Compare every source document with the target document of the same _id.
 * The source map is intentionally kept in memory only for the collection
 * currently being verified.
 */
async function verifyContent(sourceCollection, targetCollection) {
  const sourceHashes = new Map();
  let sourceDocuments = 0;
  for await (const doc of sourceCollection.find({}, { batchSize: 1000 }).sort({ _id: 1 })) {
    sourceHashes.set(idKey(doc._id), bsonHash(doc));
    sourceDocuments += 1;
  }

  let verified = 0;
  let mismatched = 0;
  let targetOnly = 0;
  let targetDocuments = 0;

  for await (const doc of targetCollection.find({}, { batchSize: 1000 }).sort({ _id: 1 })) {
    targetDocuments += 1;
    const key = idKey(doc._id);
    const sourceHash = sourceHashes.get(key);
    if (sourceHash === undefined) {
      targetOnly += 1;
      continue;
    }
    if (sourceHash === bsonHash(doc)) {
      verified += 1;
    } else {
      mismatched += 1;
    }
    sourceHashes.delete(key);
  }

  return {
    sourceDocuments,
    targetDocuments,
    verified,
    mismatched,
    sourceOnly: sourceHashes.size,
    targetOnly,
    hashAlgorithm: 'sha256(canonical BSON, key-order independent, BSON-type tagged)',
  };
}

function indexKeySignature(key) {
  return Object.entries(key || {}).map(([field, direction]) => [field, canonical(direction)]);
}

function indexSignature(index) {
  const signature = { key: indexKeySignature(index.key) };
  signature.unique = Boolean(index.unique);
  signature.sparse = Boolean(index.sparse);
  for (const key of [
    'expireAfterSeconds', 'partialFilterExpression', 'collation', 'weights',
    'default_language', 'language_override', 'textIndexVersion', '2dsphereIndexVersion',
    'bits', 'min', 'max', 'bucketSize', 'wildcardProjection', 'hidden',
  ]) {
    if (index[key] !== undefined && index[key] !== null) signature[key] = canonical(index[key]);
  }
  return JSON.stringify(signature);
}

async function verifyIndexes(sourceCollection, targetCollection) {
  const sourceIndexes = await sourceCollection.listIndexes().toArray();
  const targetIndexes = await targetCollection.listIndexes().toArray();
  const sourceByName = new Map(sourceIndexes.map((index) => [index.name, index]));
  const targetByName = new Map(targetIndexes.map((index) => [index.name, index]));

  const missing = [];
  const conflicts = [];
  for (const [name, sourceIndex] of sourceByName) {
    const targetIndex = targetByName.get(name);
    if (!targetIndex) {
      missing.push(name);
    } else if (indexSignature(sourceIndex) !== indexSignature(targetIndex)) {
      conflicts.push(name);
    }
  }
  const extra = [...targetByName.keys()].filter((name) => !sourceByName.has(name));

  return {
    sourceCount: sourceIndexes.length,
    targetCount: targetIndexes.length,
    missing,
    extra,
    conflicts,
    status: missing.length || conflicts.length ? 'FAIL' : 'PASS',
  };
}

const COLLECTION_OPTION_KEYS = [
  'capped', 'size', 'max', 'validator', 'validationLevel', 'validationAction',
  'collation', 'timeseries', 'expireAfterSeconds', 'viewOn', 'pipeline', 'clusteredIndex',
];

function compareCollectionOptions(sourceInfo, targetInfo) {
  const pick = (info) => {
    const out = {};
    for (const key of COLLECTION_OPTION_KEYS) {
      if (info?.options?.[key] !== undefined) out[key] = info.options[key];
    }
    return out;
  };
  const sourceOptions = pick(sourceInfo);
  const targetOptions = pick(targetInfo);
  const differences = COLLECTION_OPTION_KEYS.filter(
    (key) => canonical(sourceOptions[key]) !== canonical(targetOptions[key])
  );
  return { status: differences.length ? 'WARN' : 'PASS', differences, sourceOptions, targetOptions };
}

/** Resolve a dotted path through nested objects and arrays. */
function getValues(document, fieldPath) {
  let current = [document];
  for (const part of fieldPath.split('.')) {
    const next = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;
      if (Array.isArray(item)) {
        for (const element of item) {
          if (element && typeof element === 'object' && part in element) next.push(element[part]);
        }
      } else if (typeof item === 'object' && part in item) {
        next.push(item[part]);
      }
    }
    current = next;
  }

  const values = [];
  const walk = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const element of value) walk(element);
      return;
    }
    // A populated reference is still a reference; compare its _id.
    if (typeof value === 'object' && value._id && !value._bsontype) {
      walk(value._id);
      return;
    }
    values.push(value);
  };
  for (const value of current) walk(value);
  return values;
}

/** A ref may be stored as ObjectId or as its 24-hex string form. */
function referenceKeys(value) {
  const keys = new Set([idKey(value)]);
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
    keys.add(idKey(new BSON.ObjectId(value)));
  }
  if (value && value._bsontype === 'ObjectId') {
    keys.add(idKey(value.toHexString()));
  }
  return [...keys];
}

/**
 * Relationships declared with `ref:` in the model schemas. Field names are
 * read from the live Mongoose schemas, not guessed from collection names.
 */
async function collectModelRelationships() {
  const catalog = buildModelCatalog();
  const refMap = new Map();
  for (const entry of catalog) {
    for (const modelName of entry.modelNames) refMap.set(modelName.toLowerCase(), entry.collection);
    refMap.set(entry.collection.toLowerCase(), entry.collection);
  }
  refMap.set('barcodelabel', 'barcodeLabel');

  const relationships = new Map();
  const unresolved = [];
  for (const entry of catalog) {
    if (!includedSet.has(entry.collection)) continue;
    const modelFile = entry.files.find((file) => file.startsWith('models/'));
    if (!modelFile) continue;

    let model;
    try {
      const module = await import(pathToFileURL(path.join(ROOT, modelFile)).href);
      model = module.default;
    } catch (error) {
      unresolved.push({ collection: entry.collection, file: modelFile, error: error.message });
      continue;
    }
    if (!model?.schema?.paths) continue;

    for (const [field, schemaType] of Object.entries(model.schema.paths)) {
      const ref = schemaType?.options?.ref;
      if (!ref) continue;
      const targetCollection = refMap.get(String(ref).toLowerCase());
      if (!targetCollection) {
        unresolved.push({ collection: entry.collection, field, ref });
        continue;
      }
      const key = `${entry.collection}|${field}|${targetCollection}`;
      if (!relationships.has(key)) {
        relationships.set(key, {
          from: entry.collection,
          field,
          to: targetCollection,
          targetExcluded: !includedSet.has(targetCollection),
          source: 'model-ref',
        });
      }
    }
  }

  // The barcode stock model stores some barcode links without a Mongoose
  // `ref` (deliberately, so a missing barcode never breaks a stock movement).
  // They are added explicitly so the cost of the approved barcodeLabel
  // exclusion is measured rather than hidden.
  for (const [from, field] of [
    ['stockmovement', 'barcodeId'],
    ['iciteminvoice', 'items.barcodeId'],
    ['iciteminvoice', 'items.sourceBarcodeId'],
    ['storedeliverychallan', 'items.barcodeId'],
    ['stocktransfer', 'items.barcodeId'],
    ['stocktransferlocation', 'items.barcodeId'],
    ['stocktransferpacket', 'items.barcodeId'],
    ['stocktransferreceived', 'items.barcodeId'],
    ['salesreturn', 'items.barcodeId'],
    ['storedebitnote', 'items.barcodeId'],
    ['storesalesinvoice', 'items.barcodeId'],
    ['storesalesreturn', 'items.barcodeId'],
  ]) {
    if (!includedSet.has(from)) continue;
    const key = `${from}|${field}|barcodeLabel`;
    if (!relationships.has(key)) {
      relationships.set(key, {
        from,
        field,
        to: 'barcodeLabel',
        targetExcluded: true,
        source: 'manual-barcode-ref',
      });
    }
  }

  return { relationships: [...relationships.values()], unresolved };
}

async function main() {
  const source = await connect(sourceUri);
  const target = await connect(targetUri, { direct: true });
  const sourceDb = source.db(sourceDbName);
  const targetDb = target.db(targetDbName);

  const sourceInfos = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const targetInfos = await targetDb.listCollections({}, { nameOnly: false }).toArray();
  const sourceInfoByName = new Map(sourceInfos.map((info) => [info.name, info]));
  const targetInfoByName = new Map(targetInfos.map((info) => [info.name, info]));
  const targetNames = new Set(targetInfos.map((info) => info.name));

  const errors = [];
  const warnings = [];
  const collectionResults = [];

  for (const row of includedRows) {
    const name = row.name;
    const sourceCollection = sourceDb.collection(name);
    const targetCollection = targetDb.collection(name);

    const sourceCount = await sourceCollection.countDocuments();
    const targetCount = targetCollection ? await targetCollection.countDocuments() : 0;
    const targetMissingId = targetCollection
      ? await targetCollection.countDocuments({ _id: { $exists: false } })
      : 0;
    const targetDuplicateIdGroups = targetCollection
      ? await countDuplicateIdGroups(targetCollection)
      : 0;
    const content = targetCollection
      ? await verifyContent(sourceCollection, targetCollection)
      : {
          sourceDocuments: sourceCount,
          targetDocuments: 0,
          verified: 0,
          mismatched: 0,
          sourceOnly: sourceCount,
          targetOnly: 0,
          hashAlgorithm: 'not run (target collection missing)',
        };
    const indexes = targetCollection
      ? await verifyIndexes(sourceCollection, targetCollection)
      : { sourceCount: 0, targetCount: 0, missing: [], extra: [], conflicts: [], status: 'FAIL' };
    const options = compareCollectionOptions(sourceInfoByName.get(name), targetInfoByName.get(name));

    const failures = [];
    if (sourceCount !== targetCount) failures.push('document count');
    if (targetMissingId > 0) failures.push('missing _id');
    if (targetDuplicateIdGroups > 0) failures.push('duplicate _id');
    if (content.mismatched > 0) failures.push('document content');
    if (content.sourceOnly > 0) failures.push('missing target documents');
    if (content.targetOnly > 0) failures.push('extra target documents');
    if (indexes.status === 'FAIL') failures.push('indexes');
    if (options.differences.length) warnings.push(`${name}: collection options differ (${options.differences.join(', ')})`);
    if (indexes.extra.length) warnings.push(`${name}: extra target indexes (${indexes.extra.join(', ')})`);

    const status = failures.length ? 'FAIL' : 'PASS';
    if (failures.length) {
      errors.push(`${name}: ${failures.join('; ')}`);
    }

    collectionResults.push({
      name,
      sourceCount,
      targetCount,
      difference: targetCount - sourceCount,
      status,
      failures,
      ids: { targetMissingId, targetDuplicateIdGroups },
      content,
      indexes,
      options,
      model: row.model ? { modelNames: row.model.modelNames, module: row.model.module } : null,
    });

    console.log(
      `${status.padEnd(4)} ${name.padEnd(32)} source=${String(sourceCount).padStart(7)} ` +
      `target=${String(targetCount).padStart(7)} verified=${String(content.verified).padStart(7)} ` +
      `mismatch=${content.mismatched} missing=${content.sourceOnly} extra=${content.targetOnly} ` +
      `idx=${indexes.targetCount}/${indexes.sourceCount}`
    );
  }

  // ---- Excluded collection isolation ----
  const excludedResults = [];
  const excludedNames = new Set(excludedRows.map((row) => row.name));
  for (const row of excludedRows) {
    const info = targetInfoByName.get(row.name);
    const targetCount = info ? await targetDb.collection(row.name).countDocuments() : 0;
    const status = !info || targetCount === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') errors.push(`excluded collection ${row.name} exists in target with ${targetCount} documents`);
    excludedResults.push({
      name: row.name,
      category: row.classification.category,
      sourceCount: row.sourceCount,
      targetPresent: Boolean(info),
      targetCount,
      status,
      reason: row.classification.reason,
    });
  }
  for (const name of POS_COLLECTIONS.keys()) {
    if (excludedNames.has(name)) continue;
    const info = targetInfoByName.get(name);
    const targetCount = info ? await targetDb.collection(name).countDocuments() : 0;
    const status = !info || targetCount === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') errors.push(`excluded POS collection ${name} exists in target with ${targetCount} documents`);
    excludedResults.push({
      name,
      category: 'POS',
      sourceCount: 0,
      targetPresent: Boolean(info),
      targetCount,
      status,
      reason: POS_COLLECTIONS.get(name),
    });
  }

  // ---- Relationship validation ----
  const { relationships, unresolved } = await collectModelRelationships();
  const relationshipResults = [];
  const idSetCache = new Map();
  const sourceIdSetCache = new Map();

  async function targetIdSet(collectionName) {
    if (idSetCache.has(collectionName)) return idSetCache.get(collectionName);
    const set = targetNames.has(collectionName)
      ? new Set((await targetDb.collection(collectionName).find({}, { projection: { _id: 1 } }).toArray()).map((doc) => idKey(doc._id)))
      : new Set();
    idSetCache.set(collectionName, set);
    return set;
  }

  async function sourceIdSet(collectionName) {
    if (sourceIdSetCache.has(collectionName)) return sourceIdSetCache.get(collectionName);
    const set = sourceInfoByName.has(collectionName)
      ? new Set((await sourceDb.collection(collectionName).find({}, { projection: { _id: 1 } }).toArray()).map((doc) => idKey(doc._id)))
      : new Set();
    sourceIdSetCache.set(collectionName, set);
    return set;
  }

  const relationshipsByFrom = new Map();
  for (const relationship of relationships) {
    if (!targetNames.has(relationship.from)) continue;
    if (!relationshipsByFrom.has(relationship.from)) relationshipsByFrom.set(relationship.from, []);
    relationshipsByFrom.get(relationship.from).push(relationship);
  }

  for (const [from, rels] of relationshipsByFrom) {
    const fields = [...new Set(rels.map((rel) => rel.field))];
    const filter = { $or: fields.map((field) => ({ [field]: { $exists: true, $ne: null } })) };
    const projection = Object.fromEntries(fields.map((field) => [field, 1]));
    const documents = await targetDb.collection(from).find(filter, { projection }).toArray();

    for (const rel of rels) {
      let documentsWithRef = 0;
      let referencesChecked = 0;
      let resolvedReferences = 0;
      let lostReferences = 0;
      let preExistingDangling = 0;
      let excludedSourceResolvable = 0;
      const lostSamples = [];
      const danglingSamples = [];

      if (rel.targetExcluded) {
        // The referenced collection is intentionally absent from the target.
        // Count how many references would resolve if it were migrated, and how
        // many were already dangling in the source, so the cost is explicit.
        const sourceIds = await sourceIdSet(rel.to);
        for (const document of documents) {
          const values = getValues(document, rel.field);
          if (values.length) documentsWithRef += 1;
          for (const value of values) {
            referencesChecked += 1;
            if (referenceKeys(value).some((key) => sourceIds.has(key))) {
              excludedSourceResolvable += 1;
            } else {
              preExistingDangling += 1;
              if (danglingSamples.length < 5) danglingSamples.push(String(value));
            }
          }
        }
        relationshipResults.push({
          ...rel,
          documentsWithRef,
          referencesChecked,
          resolvedReferences: 0,
          lostReferences: 0,
          preExistingDangling,
          excludedSourceResolvable,
          missingReferences: referencesChecked,
          samples: danglingSamples,
          lostSamples,
          danglingSamples,
          status: 'EXPECTED_EXCLUDED',
          note: `Referenced collection ${rel.to} is intentionally excluded. ${excludedSourceResolvable} reference(s) exist in the source and are unresolved in the target by design; ${preExistingDangling} were already dangling in the source.`,
        });
        continue;
      }

      const targetIds = await targetIdSet(rel.to);
      const sourceIds = await sourceIdSet(rel.to);
      for (const document of documents) {
        const values = getValues(document, rel.field);
        if (values.length) documentsWithRef += 1;
        for (const value of values) {
          referencesChecked += 1;
          const keys = referenceKeys(value);
          if (keys.some((key) => targetIds.has(key))) {
            resolvedReferences += 1;
          } else if (keys.some((key) => sourceIds.has(key))) {
            // The document exists in the source but is absent from the target:
            // this is a real migration loss and must fail verification.
            lostReferences += 1;
            if (lostSamples.length < 5) lostSamples.push(String(value));
          } else {
            // Missing in both databases: pre-existing source data quality
            // issue, not something this migration could have preserved.
            preExistingDangling += 1;
            if (danglingSamples.length < 5) danglingSamples.push(String(value));
          }
        }
      }

      let status = 'PASS';
      let note = 'All references resolve in the target.';
      if (lostReferences > 0) {
        status = 'FAIL';
        note = `${lostReferences} reference(s) exist in the source but are missing in the target.`;
        errors.push(`${from}.${rel.field} -> ${rel.to}: ${lostReferences} reference(s) present in source but missing in target`);
      } else if (preExistingDangling > 0) {
        status = 'PRE_EXISTING_DANGLING';
        note = `${preExistingDangling} reference(s) are already dangling in the source and were not introduced by the migration.`;
      }
      relationshipResults.push({
        ...rel,
        documentsWithRef,
        referencesChecked,
        resolvedReferences,
        lostReferences,
        preExistingDangling,
        excludedSourceResolvable,
        missingReferences: lostReferences,
        samples: lostSamples.length ? lostSamples : danglingSamples,
        lostSamples,
        danglingSamples,
        status,
        note,
      });
    }
  }

  const normalDanglingRows = relationshipResults.filter((row) => row.status === 'PRE_EXISTING_DANGLING');
  const normalDanglingReferences = normalDanglingRows.reduce((total, row) => total + row.preExistingDangling, 0);
  const excludedDanglingReferences = relationshipResults
    .filter((row) => row.status === 'EXPECTED_EXCLUDED')
    .reduce((total, row) => total + row.preExistingDangling, 0);
  if (normalDanglingRows.length || excludedDanglingReferences) {
    const excludedNote = excludedDanglingReferences
      ? `; ${excludedDanglingReferences} additional dangling reference(s) sit inside intentionally excluded references`
      : '';
    warnings.push(`${normalDanglingRows.length} relationship(s) contain ${normalDanglingReferences} reference(s) that are already dangling in the source and are not migration failures${excludedNote}.`);
  }

  for (const item of unresolved) {
    warnings.push(`relationship unresolved: ${item.collection}.${item.field || ''} -> ${item.ref || item.file} (${item.error || 'no matching collection'})`);
  }

  // ---- Summary ----
  const sum = (iterate, selector) => iterate.reduce((total, item) => total + selector(item), 0);
  const summary = {
    sourceCollections: sourceInfos.length,
    targetCollections: targetInfos.length,
    includedCollections: collectionResults.length,
    excludedCollections: excludedRows.length,
    excludedCollectionChecks: excludedResults.length,
    sourceDocuments: sum(collectionResults, (row) => row.sourceCount),
    targetDocuments: sum(collectionResults, (row) => row.targetCount),
    verifiedDocuments: sum(collectionResults, (row) => row.content.verified),
    missingDocuments: sum(collectionResults, (row) => row.content.sourceOnly),
    extraDocuments: sum(collectionResults, (row) => row.content.targetOnly),
    mismatchedDocuments: sum(collectionResults, (row) => row.content.mismatched),
    failedDocuments: sum(collectionResults, (row) => row.content.mismatched + row.content.sourceOnly + row.content.targetOnly),
    collectionsPassed: collectionResults.filter((row) => row.status === 'PASS').length,
    collectionsFailed: collectionResults.filter((row) => row.status === 'FAIL').length,
    targetMissingIdDocuments: sum(collectionResults, (row) => row.ids.targetMissingId),
    targetDuplicateIdCollections: collectionResults.filter((row) => row.ids.targetDuplicateIdGroups > 0).length,
    indexesExpected: sum(collectionResults, (row) => row.indexes.sourceCount),
    indexesPresent: sum(collectionResults, (row) => row.indexes.targetCount),
    indexesMissing: sum(collectionResults, (row) => row.indexes.missing.length),
    indexConflicts: sum(collectionResults, (row) => row.indexes.conflicts.length),
    indexesExtra: sum(collectionResults, (row) => row.indexes.extra.length),
    relationshipsChecked: relationshipResults.length,
    relationshipsPassed: relationshipResults.filter((row) => row.status === 'PASS' || row.status === 'PRE_EXISTING_DANGLING').length,
    relationshipsFailed: relationshipResults.filter((row) => row.status === 'FAIL').length,
    relationshipsPreExistingDangling: relationshipResults.filter((row) => row.status === 'PRE_EXISTING_DANGLING').length,
    relationshipsExpectedExcluded: relationshipResults.filter((row) => row.status === 'EXPECTED_EXCLUDED').length,
    referencesChecked: sum(relationshipResults, (row) => row.referencesChecked),
    referencesResolved: sum(relationshipResults, (row) => row.resolvedReferences),
    referencesLost: sum(relationshipResults, (row) => row.lostReferences),
    referencesPreExistingDangling: sum(relationshipResults, (row) => row.preExistingDangling),
    referencesExcludedSourceResolvable: sum(relationshipResults, (row) => row.excludedSourceResolvable),
    excludedIsolationPassed: excludedResults.filter((row) => row.status === 'PASS').length,
    excludedIsolationFailed: excludedResults.filter((row) => row.status === 'FAIL').length,
  };

  const applied = Object.values(checkpoint.collections || {});
  const migrationStats = {
    checkpointCollections: applied.length,
    checkpointComplete: applied.filter((state) => state.status === 'complete').length,
    inserted: sum(applied, (state) => state.inserted || 0),
    existing: sum(applied, (state) => state.existing || 0),
    scanned: sum(applied, (state) => state.scanned || 0),
    conflicts: sum(applied, (state) => state.conflicts || 0),
    batches: sum(applied, (state) => state.batches || 0),
    durationSeconds: checkpoint.durationSeconds || 0,
    finishedAt: checkpoint.finishedAt || null,
    lastSync: checkpoint.lastSync || null,
    lastRun: checkpoint.lastRun || null,
    fatal: checkpoint.fatal || null,
    errors: checkpoint.errors || [],
  };

  const impossibleFailures = [];
  if (summary.collectionsFailed) impossibleFailures.push(`${summary.collectionsFailed} included collection(s) failed verification`);
  if (summary.missingDocuments) impossibleFailures.push(`${summary.missingDocuments} missing target document(s)`);
  if (summary.extraDocuments) impossibleFailures.push(`${summary.extraDocuments} extra target document(s)`);
  if (summary.mismatchedDocuments) impossibleFailures.push(`${summary.mismatchedDocuments} document content mismatch(es)`);
  if (summary.indexesMissing) impossibleFailures.push(`${summary.indexesMissing} missing index(es)`);
  if (summary.indexConflicts) impossibleFailures.push(`${summary.indexConflicts} index conflict(s)`);
  if (summary.excludedIsolationFailed) impossibleFailures.push(`${summary.excludedIsolationFailed} excluded collection(s) leaked into target`);
  if (summary.relationshipsFailed) impossibleFailures.push(`${summary.relationshipsFailed} relationship(s) lost source-resolvable reference(s)`);

  const overallStatus = impossibleFailures.length
    ? 'FAIL'
    : (warnings.length ? 'PASS_WITH_WARNINGS' : 'PASS');

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus,
    failures: impossibleFailures,
    decision: {
      barcodeLabel: audit.classification.barcodeLabelDecision,
      barcodeLabelDocumentsExcluded: audit.rows.find((row) => row.name === 'barcodeLabel')?.sourceCount ?? 0,
      posCollectionsExcluded: [...POS_COLLECTIONS.keys()],
      note: 'barcodeLabel excluded by explicit project-owner decision. Barcode stock and barcode references are therefore not present in the target.',
    },
    source: {
      host: redactedHost(sourceUri),
      database: sourceDbName,
      collections: sourceInfos.length,
    },
    target: {
      host: redactedHost(targetUri),
      database: targetDbName,
      directConnectionRequired: true,
      collections: targetInfos.length,
    },
    migrationStats,
    summary,
    collections: collectionResults,
    excluded: excludedResults,
    relationships: relationshipResults,
    unresolvedRelationships: unresolved,
    warnings,
    errors,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  // ---- Markdown results ----
  const md = [];
  md.push('# MongoDB Migration Results');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push('');
  md.push(`**Overall status: ${overallStatus}**`);
  md.push('');
  if (impossibleFailures.length) {
    md.push('Failures:');
    for (const failure of impossibleFailures) md.push(`- ${failure}`);
    md.push('');
  }
  md.push('## Scope');
  md.push('');
  md.push(markdownTable(
    ['Item', 'Value'],
    [
      ['Source database', `\`${sourceDbName}\` at ${report.source.host}`],
      ['Target database', `\`${targetDbName}\` at ${report.target.host}`],
      ['Source collections discovered', report.source.collections],
      ['Target collections after migration', report.target.collections],
      ['Included collections', summary.includedCollections],
      ['Excluded source collections', summary.excludedCollections],
      ['Excluded collection isolation checks', summary.excludedCollectionChecks],
      ['Total source documents (included)', summary.sourceDocuments],
      ['Documents inserted by initial migration', migrationStats.inserted],
      ['Documents already present at initial migration', migrationStats.existing],
      ['Total failed documents', summary.failedDocuments],
      ['Total verified documents', summary.verifiedDocuments],
      ['Missing documents', summary.missingDocuments],
      ['Extra target documents', summary.extraDocuments],
      ['Mismatched documents', summary.mismatchedDocuments],
      ['Migration duration', `${migrationStats.durationSeconds}s`],
      ['Last sync', migrationStats.lastSync
        ? `${migrationStats.lastSync.status} at ${migrationStats.lastSync.finishedAt}; scanned ${migrationStats.lastSync.scanned}, inserted ${migrationStats.lastSync.inserted}, existing ${migrationStats.lastSync.existing}, duration ${migrationStats.lastSync.durationSeconds}s`
        : 'not run'],
    ]
  ));
  md.push('');
  md.push('## Approved exclusion decision');
  md.push('');
  md.push(`- **barcodeLabel: ${report.decision.barcodeLabel || 'UNKNOWN'}** — ${report.decision.barcodeLabelDocumentsExcluded} source documents were not migrated.`);
  md.push(`- POS collections excluded: ${report.decision.posCollectionsExcluded.map((name) => `\`${name}\``).join(', ')}.`);
  md.push('');
  md.push('The barcode stock collection is the collection named `barcodeLabel` in `lib/barcodeLabel.js`. Because the project owner chose strict exclusion, barcode stock, barcode identifiers and barcode history are **not** in the target. Barcode search, barcode generation, GRC barcode printing, barcode-based stock reports and any barcode lookup will not return migrated units until that collection is migrated or rebuilt. This is an accepted consequence of the decision, not a verification failure.');
  md.push('');
  md.push('## Collection verification');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Source', 'Target', 'Difference', 'Verified', 'Mismatch', 'Source only', 'Target only', 'Indexes', 'Status'],
    collectionResults.map((row) => [
      row.name,
      row.sourceCount,
      row.targetCount,
      row.difference,
      row.content.verified,
      row.content.mismatched,
      row.content.sourceOnly,
      row.content.targetOnly,
      `${row.indexes.targetCount}/${row.indexes.sourceCount}`,
      row.status,
    ])
  ));
  md.push('');
  md.push('## Index migration');
  md.push('');
  md.push(markdownTable(
    ['Metric', 'Value'],
    [
      ['Indexes expected on included collections', summary.indexesExpected],
      ['Indexes present in target', summary.indexesPresent],
      ['Missing indexes', summary.indexesMissing],
      ['Index conflicts', summary.indexConflicts],
      ['Extra target indexes', summary.indexesExtra],
    ]
  ));
  md.push('');
  const indexProblems = collectionResults.filter((row) => row.indexes.status === 'FAIL');
  if (indexProblems.length) {
    md.push(markdownTable(
      ['Collection', 'Missing indexes', 'Conflicts', 'Extra indexes'],
      indexProblems.map((row) => [
        row.name,
        row.indexes.missing.join(', ') || '—',
        row.indexes.conflicts.join(', ') || '—',
        row.indexes.extra.join(', ') || '—',
      ])
    ));
    md.push('');
  } else {
    md.push('All included collections have the same index names, key patterns and options as the source.');
    md.push('');
  }
  md.push('## Excluded collection isolation');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Category', 'Source docs', 'Target present', 'Target docs', 'Status'],
    excludedResults.map((row) => [
      row.name,
      row.category,
      row.sourceCount,
      row.targetPresent ? 'YES' : 'no',
      row.targetCount,
      row.status,
    ])
  ));
  md.push('');
  md.push('## Relationship validation');
  md.push('');
  md.push(markdownTable(
    ['From collection', 'Field', 'Referenced collection', 'Documents with ref', 'References checked', 'Resolved in target', 'Lost in target', 'Pre-existing dangling', 'Source-resolvable but excluded', 'Status'],
    relationshipResults.map((row) => [
      row.from,
      row.field,
      row.to,
      row.documentsWithRef,
      row.referencesChecked,
      row.resolvedReferences,
      row.lostReferences,
      row.preExistingDangling,
      row.excludedSourceResolvable,
      row.status,
    ])
  ));
  md.push('');
  md.push(`Definitions checked: ${summary.relationshipsChecked}; passed: ${summary.relationshipsPassed}; failed: ${summary.relationshipsFailed}; expected-excluded: ${summary.relationshipsExpectedExcluded}. References checked: ${summary.referencesChecked}; resolved in target: ${summary.referencesResolved}; lost in target: ${summary.referencesLost}; already dangling in source: ${summary.referencesPreExistingDangling}; source-resolvable but excluded: ${summary.referencesExcludedSourceResolvable}.`);
  md.push('');
  md.push('`FAIL` means a referenced document exists in the source but is absent from the target — a real migration loss. `PRE_EXISTING_DANGLING` means the referenced id is missing from **both** databases; it was already broken in the source and is not a migration failure. `EXPECTED_EXCLUDED` rows point at `barcodeLabel` or a POS collection that was intentionally excluded; `Source-resolvable but excluded` counts references that would resolve if the excluded collection were migrated.');
  md.push('');
  md.push('## Warnings');
  md.push('');
  if (warnings.length) {
    for (const warning of warnings) md.push(`- ${warning}`);
  } else {
    md.push('None.');
  }
  md.push('');
  md.push('## Application connection verification');
  md.push('');
  md.push('- The target replica set advertises `127.0.0.1:27017`. From this machine the application\'s normal URI needs `directConnection=true`; without it, topology discovery tries the advertised private address and fails.');
  md.push('- The application database URI in the repository was **not** changed. Changing it is a separate operation and requires explicit approval.');
  md.push('- Database-level module checks can be run against the target with `directConnection=true`. Application login cannot be exercised without a valid test credential.');
  md.push('');
  md.push('## Deliverables');
  md.push('');
  md.push('- `MONGODB_MIGRATION_AUDIT.md`');
  md.push('- `MONGODB_MIGRATION_RESULTS.md`');
  md.push('- `mongodb-migration-report.json`');
  md.push('- `mongodb-migration-errors.log`');
  md.push('');

  fs.writeFileSync(RESULTS_MD, md.join('\n'));

  // ---- Error log (always created, even on a clean run) ----
  const logLines = [];
  logLines.push(`# MongoDB migration error log`);
  logLines.push(`Generated: ${report.generatedAt}`);
  logLines.push(`Source database: ${sourceDbName}`);
  logLines.push(`Target database: ${targetDbName}`);
  logLines.push(`Overall status: ${overallStatus}`);
  logLines.push('');
  logLines.push(`Migration checkpoint errors: ${migrationStats.errors.length}`);
  logLines.push(`Verification failures: ${errors.length}`);
  logLines.push(`Warnings: ${warnings.length}`);
  logLines.push('');
  if (!errors.length && !migrationStats.errors.length) {
    logLines.push('No migration or verification errors were recorded.');
  } else {
    for (const error of [...migrationStats.errors, ...errors]) logLines.push(`ERROR: ${error}`);
  }
  if (warnings.length) {
    logLines.push('');
    for (const warning of warnings) logLines.push(`WARN: ${warning}`);
  }
  const expectedDangling = relationshipResults.filter((row) => row.status === 'EXPECTED_EXCLUDED');
  if (expectedDangling.length) {
    logLines.push('');
    logLines.push('Expected dangling references caused by the approved exclusions:');
    for (const row of expectedDangling) {
      logLines.push(`EXPECTED: ${row.from}.${row.field} -> ${row.to}: ${row.excludedSourceResolvable} source-resolvable reference(s) unresolved by design; ${row.preExistingDangling} already dangling in source`);
    }
  }
  const preExisting = relationshipResults.filter((row) => row.preExistingDangling > 0);
  if (preExisting.length) {
    logLines.push('');
    logLines.push('Pre-existing dangling references (missing in BOTH source and target; not migration failures):');
    for (const row of preExisting) {
      logLines.push(`PRE_EXISTING: ${row.from}.${row.field} -> ${row.to}: ${row.preExistingDangling} reference(s)${row.danglingSamples?.length ? `; samples: ${row.danglingSamples.join(', ')}` : ''}`);
    }
  }
  logLines.push('');
  fs.writeFileSync(ERROR_LOG, logLines.join('\n'));

  console.log('');
  console.log(`Overall status: ${overallStatus}`);
  console.log(`Included collections: ${summary.includedCollections} | passed: ${summary.collectionsPassed} | failed: ${summary.collectionsFailed}`);
  console.log(`Documents: source=${summary.sourceDocuments} target=${summary.targetDocuments} verified=${summary.verifiedDocuments} missing=${summary.missingDocuments} extra=${summary.extraDocuments} mismatched=${summary.mismatchedDocuments}`);
  console.log(`Indexes: expected=${summary.indexesExpected} present=${summary.indexesPresent} missing=${summary.indexesMissing} conflicts=${summary.indexConflicts}`);
  console.log(`Relationships: checked=${summary.relationshipsChecked} passed=${summary.relationshipsPassed} failed=${summary.relationshipsFailed} pre-existing-dangling=${summary.relationshipsPreExistingDangling} expected-excluded=${summary.relationshipsExpectedExcluded}`);
  console.log(`References: checked=${summary.referencesChecked} resolved=${summary.referencesResolved} lost=${summary.referencesLost} pre-existing-dangling=${summary.referencesPreExistingDangling} excluded-source-resolvable=${summary.referencesExcludedSourceResolvable}`);
  console.log(`Excluded isolation: passed=${summary.excludedIsolationPassed} failed=${summary.excludedIsolationFailed}`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${RESULTS_MD}`);
  console.log(`Wrote ${ERROR_LOG}`);

  await source.close();
  await target.close();
  if (overallStatus === 'FAIL') process.exitCode = 1;
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exitCode = 1;
});
