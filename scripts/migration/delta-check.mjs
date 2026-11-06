#!/usr/bin/env node
/**
 * Read-only delta check between the source ERP database and the target.
 *
 * Reports per included collection:
 *   - source/target counts
 *   - source documents whose _id is missing in the target (pending inserts)
 *   - target documents whose _id is absent from the source (never deleted)
 *   - newest ObjectId creation time among pending source documents
 *
 * Nothing is written to either database. Optional JSON output:
 *   scripts/migration/out/delta-check.json
 *
 * Usage:
 *   node --env-file=.env scripts/migration/delta-check.mjs --exclude-barcode-label
 *   node --env-file=.env scripts/migration/delta-check.mjs --include-barcode-label
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import { classifyCollection } from './lib/classification.mjs';
import { idKey } from './lib/bson-utils.mjs';

const { MongoClient } = mongodb;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const OUT_DIR = path.join(__dirname, 'out');
const OUTPUT_JSON = path.join(OUT_DIR, 'delta-check.json');

const sourceUri = process.env.SOURCE_MONGODB_URI || '';
const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const sourceDbName = process.env.SOURCE_DB_NAME || 'test';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
if (!sourceUri) throw new Error('SOURCE_MONGODB_URI is not set');
if (!targetUri) throw new Error('TARGET_MONGODB_URI is not set');

const barcodeArg = process.argv.includes('--include-barcode-label')
  ? true
  : process.argv.includes('--exclude-barcode-label')
    ? false
    : null;

function redactedHost(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return '(unparseable)';
  }
}

async function connect(uri, { direct = false } = {}) {
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-delta',
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

async function readIds(collection) {
  const map = new Map();
  for await (const doc of collection.find({}, { projection: { _id: 1 } }).sort({ _id: 1 })) {
    map.set(idKey(doc._id), doc._id);
  }
  return map;
}

function objectIdTime(value) {
  if (value && (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID')) {
    return value.getTimestamp().toISOString();
  }
  return null;
}

async function main() {
  const source = await connect(sourceUri);
  const target = await connect(targetUri, { direct: true });
  const sourceDb = source.db(sourceDbName);
  const targetDb = target.db(targetDbName);

  const sourceInfos = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const targetInfos = await targetDb.listCollections({}, { nameOnly: false }).toArray();
  const targetNames = new Set(targetInfos.map((info) => info.name));

  const rows = [];
  const excluded = [];
  let totalSourceOnly = 0;
  let totalTargetOnly = 0;
  let totalSourceDocs = 0;
  let totalTargetDocs = 0;

  for (const info of sourceInfos.sort((a, b) => a.name.localeCompare(b.name))) {
    const classification = classifyCollection(info.name, { includeBarcodeLabel: barcodeArg });
    if (classification.status !== 'INCLUDE') {
      excluded.push({
        name: info.name,
        classification,
        sourceCount: await sourceDb.collection(info.name).countDocuments(),
        targetPresent: targetNames.has(info.name),
      });
      continue;
    }

    const sourceCol = sourceDb.collection(info.name);
    const targetCol = targetDb.collection(info.name);
    const sourceIds = await readIds(sourceCol);
    const targetIds = targetNames.has(info.name) ? await readIds(targetCol) : new Map();

    const sourceOnly = [...sourceIds.entries()].filter(([key]) => !targetIds.has(key));
    const targetOnly = [...targetIds.entries()].filter(([key]) => !sourceIds.has(key));
    const sourceOnlyTimes = sourceOnly
      .map(([, value]) => objectIdTime(value))
      .filter(Boolean)
      .sort();

    totalSourceOnly += sourceOnly.length;
    totalTargetOnly += targetOnly.length;
    totalSourceDocs += sourceIds.size;
    totalTargetDocs += targetIds.size;

    if (sourceOnly.length || targetOnly.length || !targetNames.has(info.name)) {
      rows.push({
        name: info.name,
        sourceCount: sourceIds.size,
        targetCount: targetIds.size,
        targetCollectionPresent: targetNames.has(info.name),
        sourceOnly: sourceOnly.length,
        targetOnly: targetOnly.length,
        newestMissingIdTime: sourceOnlyTimes.at(-1) || null,
        oldestMissingIdTime: sourceOnlyTimes[0] || null,
        sourceOnlySamples: sourceOnly.slice(0, 10).map(([, value]) => String(value)),
        targetOnlySamples: targetOnly.slice(0, 10).map(([key]) => key),
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    source: {
      host: redactedHost(sourceUri),
      database: sourceDbName,
      collections: sourceInfos.length,
      includedDocuments: totalSourceDocs,
    },
    target: {
      host: redactedHost(targetUri),
      database: targetDbName,
      collections: targetInfos.length,
      includedDocuments: totalTargetDocs,
    },
    barcodeLabelDecision: barcodeArg === true ? 'INCLUDE' : barcodeArg === false ? 'EXCLUDE' : 'DECISION_REQUIRED',
    summary: {
      collectionsWithDelta: rows.length,
      missingInTarget: totalSourceOnly,
      targetOnly: totalTargetOnly,
      sourceIncludedDocuments: totalSourceDocs,
      targetIncludedDocuments: totalTargetDocs,
    },
    collections: rows,
    excluded,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));

  console.log(`Source: ${sourceDbName} at ${redactedHost(sourceUri)} | ${sourceInfos.length} collections | ${totalSourceDocs} included docs`);
  console.log(`Target: ${targetDbName} at ${redactedHost(targetUri)} | ${targetInfos.length} collections | ${totalTargetDocs} included docs`);
  console.log(`Missing in target: ${totalSourceOnly} | target-only: ${totalTargetOnly} | collections with delta: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(32)} source=${String(row.sourceCount).padStart(7)} target=${String(row.targetCount).padStart(7)} ` +
      `missing=${String(row.sourceOnly).padStart(6)} targetOnly=${String(row.targetOnly).padStart(5)}` +
      `${row.newestMissingIdTime ? ` newestMissingId=${row.newestMissingIdTime}` : ''}`
    );
  }
  console.log(`Wrote ${OUTPUT_JSON}`);

  await source.close();
  await target.close();
  if (totalTargetOnly > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('Delta check failed:', error.message);
  process.exitCode = 1;
});
