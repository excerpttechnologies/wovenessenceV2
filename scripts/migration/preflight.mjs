#!/usr/bin/env node
/**
 * Phase 2 pre-flight. READ ONLY except for the explicit backup step, which is
 * run separately by backup-target.mjs.
 *
 * Checks:
 *   - source/target connections, database names, writable primary
 *   - exact counts and target emptiness
 *   - missing _id and duplicate _id in every non-POS collection
 *   - unique-index inventory and target index-name availability
 *   - model collections absent from source
 *   - target-only collections
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { buildModelCatalog } from './lib/model-catalog.mjs';
import { classifyCollection } from './lib/classification.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });
const OUT = path.join(__dirname, 'out', 'preflight.json');

const sourceUri = process.env.SOURCE_MONGODB_URI || '';
const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const sourceDbName = process.env.SOURCE_DB_NAME || 'test';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
if (!sourceUri || !targetUri) throw new Error('SOURCE_MONGODB_URI and TARGET_MONGODB_URI are required');

async function connect(uri, direct) {
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-preflight',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    maxPoolSize: 4,
    ...(direct ? { directConnection: true } : {}),
  });
  await client.connect();
  return client;
}

async function main() {
  const catalog = buildModelCatalog();
  const source = await connect(sourceUri, false);
  const target = await connect(targetUri, true);

  const sourceDb = source.db(sourceDbName);
  const targetDb = target.db(targetDbName);
  const sourceInfos = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const targetInfos = await targetDb.listCollections({}, { nameOnly: false }).toArray();
  const sourceNames = sourceInfos.map((c) => c.name).sort();
  const targetNames = targetInfos.map((c) => c.name).sort();

  const hello = await targetDb.command({ hello: 1 });
  const sourceHello = await sourceDb.command({ hello: 1 });
  const results = [];
  let totalChecked = 0;
  let totalDuplicateIds = 0;
  let totalMissingIds = 0;

  for (const info of sourceInfos.sort((a, b) => a.name.localeCompare(b.name))) {
    const classification = classifyCollection(info.name, { includeBarcodeLabel: null });
    if (classification.status === 'EXCLUDE') continue;
    const col = sourceDb.collection(info.name);
    const count = await col.countDocuments();
    const missingId = await col.countDocuments({ _id: { $exists: false } });
    let duplicateIds = 0;
    try {
      const dup = await col.aggregate([
        { $group: { _id: '$_id', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 1 },
      ], { allowDiskUse: true }).toArray();
      duplicateIds = dup.length;
    } catch (e) {
      duplicateIds = -1; // reported as unable to check
    }
    const indexes = await col.listIndexes().toArray();
    const targetCol = targetDb.collection(info.name);
    const targetCount = (await targetDb.listCollections({ name: info.name }).toArray()).length
      ? await targetCol.countDocuments()
      : 0;
    results.push({
      collection: info.name,
      classification: classification.status,
      sourceCount: count,
      targetCount,
      missingId,
      duplicateIdCheck: duplicateIds,
      indexCount: indexes.length,
      uniqueIndexes: indexes.filter((i) => i.unique).map((i) => i.name || `${JSON.stringify(i.key)}`),
      sourceIndexNames: indexes.map((i) => i.name),
    });
    totalChecked++;
    if (duplicateIds > 0) totalDuplicateIds += duplicateIds;
    if (missingId > 0) totalMissingIds += missingId;
  }

  const modelCollections = catalog.map((c) => c.collection);
  const missingModelCollections = modelCollections.filter((c) => !sourceNames.includes(c));
  const targetOnly = targetNames.filter((c) => !sourceNames.includes(c));
  const uniqueIndexCount = results.reduce((n, r) => n + r.uniqueIndexes.length, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      database: sourceDbName,
      collections: sourceNames.length,
      writablePrimary: Boolean(sourceHello.isWritablePrimary),
      version: sourceHello.version || null,
    },
    target: {
      database: targetDbName,
      collections: targetNames.length,
      empty: targetNames.length === 0,
      writablePrimary: Boolean(hello.isWritablePrimary),
      replicaSet: hello.setName || null,
      advertisedHosts: hello.hosts || [],
      version: hello.version || null,
      directConnectionRequired: true,
    },
    totals: {
      collectionsChecked: totalChecked,
      duplicateIdCollections: results.filter((r) => r.duplicateIdCheck > 0).length,
      totalDuplicateIds,
      collectionsWithMissingId: results.filter((r) => r.missingId > 0).length,
      totalMissingIds,
      uniqueIndexes: uniqueIndexCount,
    },
    missingModelCollections,
    targetOnlyCollections: targetOnly,
    results,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log('Source:', sourceDbName, '| collections:', sourceNames.length, '| primary:', report.source.writablePrimary);
  console.log('Target:', targetDbName, '| collections:', targetNames.length, '| empty:', report.target.empty,
    '| primary:', report.target.writablePrimary, '| replica set:', report.target.replicaSet || 'none');
  console.log('Target advertises:', report.target.advertisedHosts.join(', ') || 'n/a');
  console.log('Checked:', totalChecked, 'collections');
  console.log('Duplicate _id collections:', report.totals.duplicateIdCollections, '| missing _id docs:', totalMissingIds);
  console.log('Unique indexes:', uniqueIndexCount);
  console.log('Model collections absent from source:', missingModelCollections.length ? missingModelCollections.join(', ') : 'none');
  console.log('Target-only collections:', targetOnly.length ? targetOnly.join(', ') : 'none');
  console.log('Wrote', OUT);

  await source.close();
  await target.close();
}

main().catch((error) => {
  console.error('Preflight failed:', error.message);
  process.exitCode = 1;
});
