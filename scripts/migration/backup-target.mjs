#!/usr/bin/env node
/**
 * Verified pre-migration backup of the TARGET database.
 *
 * - If the target is empty, writes a signed manifest saying so (there is no
 *   data to dump, which is itself the safety fact that matters).
 * - If it is not empty, streams every collection to EJSON (type-preserving)
 *   and records counts, indexes and SHA-256 checksums.
 *
 * This script never writes to, drops or truncates the target.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
if (!targetUri) throw new Error('TARGET_MONGODB_URI is not set');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, '.backups', 'mongodb-migration', `target-pre-migration-${stamp}`);

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function main() {
  const client = new MongoClient(targetUri, {
    appName: 'wovenessence-migration-target-backup',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    directConnection: true,
  });
  await client.connect();
  const db = client.db(targetDbName);
  const hello = await db.command({ hello: 1 });
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();

  fs.mkdirSync(backupDir, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    database: targetDbName,
    host: (() => {
      try { return new URL(targetUri).host; } catch { return '(redacted)'; }
    })(),
    writablePrimary: Boolean(hello.isWritablePrimary),
    replicaSet: hello.setName || null,
    empty: infos.length === 0,
    collectionCount: infos.length,
    collections: [],
  };

  for (const info of infos) {
    const col = db.collection(info.name);
    const count = await col.countDocuments();
    const indexes = await col.listIndexes().toArray();
    const file = path.join(backupDir, `${encodeURIComponent(info.name)}.ejsonl`);
    const out = fs.createWriteStream(file, { encoding: 'utf8' });
    let hash = crypto.createHash('sha256');
    let written = 0;
    const cursor = col.find({}, { batchSize: 500 });
    for await (const doc of cursor) {
      const line = EJSON.stringify(doc, { relaxed: false }) + '\n';
      hash.update(line);
      if (!out.write(line)) await new Promise((resolve) => out.once('drain', resolve));
      written++;
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    manifest.collections.push({
      name: info.name,
      type: info.type || 'collection',
      count,
      written,
      file: path.basename(file),
      sha256: hash.digest('hex'),
      indexes,
      options: info.options || {},
    });
  }

  manifest.sha256 = sha256(JSON.stringify(manifest));
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(backupDir, 'README.txt'), [
    'Pre-migration target backup.',
    'EJSON lines preserve BSON types (ObjectId, Date, Decimal128, Binary, Long, etc.).',
    'Restore is intentionally manual: no automatic restore path is wired to the application.',
    `Database: ${targetDbName}`,
    `Created: ${manifest.generatedAt}`,
    `Empty at backup time: ${manifest.empty}`,
    '',
  ].join('\n'));

  console.log('Target backup:', backupDir);
  console.log('Target collections:', infos.length, '| empty:', manifest.empty);
  console.log('Writable primary:', manifest.writablePrimary, '| replica set:', manifest.replicaSet || 'none');
  await client.close();
}

main().catch((error) => {
  console.error('Backup failed:', error.message);
  process.exitCode = 1;
});
