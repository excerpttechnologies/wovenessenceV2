#!/usr/bin/env node
/**
 * Read-only connection and collection inventory for the Atlas -> self-hosted
 * MongoDB migration.
 *
 * Credentials come ONLY from .env / the process environment. This script never
 * prints a URI, a password, or any part of a connection string other than the
 * protocol and host, and it performs no write operation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const OUT_DIR = path.join(__dirname, 'out');
const OUT_FILE = path.join(OUT_DIR, 'connection-inventory.json');

function safeLabel(raw) {
  if (!raw) return '(missing)';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname && u.pathname !== '/' ? u.pathname : ''}`;
  } catch {
    return '(unparseable URI)';
  }
}

function dbNameFromUri(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const name = decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0]);
    return name || '';
  } catch {
    return '';
  }
}

function maskUri(raw) {
  // Keep only protocol + host + database for logs. Never user/password.
  return safeLabel(raw);
}

async function connect(uri, which) {
  if (!uri) throw new Error(`${which} URI is not set`);
  // The self-hosted target is a single-node replica set that advertises
  // 127.0.0.1:27017 in its hello response. Connecting through its public
  // address therefore needs directConnection=true; topology discovery would
  // otherwise try to reach the server's private advertised host.
  const direct = which === 'TARGET' && process.env.MIGRATION_TARGET_DIRECT !== 'false';
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-inventory',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    maxPoolSize: 5,
    ...(direct ? { directConnection: true } : {}),
  });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  return client;
}

async function listCandidateDatabases(client) {
  const wanted = new Set(['admin', 'local', 'config']);
  try {
    const result = await client.db('admin').command({ listDatabases: 1, nameOnly: true });
    return (result.databases || [])
      .map((d) => d.name)
      .filter((name) => !wanted.has(name));
  } catch (error) {
    const fromUri = dbNameFromUri(client.options?.metadata?.connectionString || '');
    return fromUri ? [fromUri] : [];
  }
}

async function describeDatabase(client, dbName) {
  const db = client.db(dbName);
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();
  const collections = [];
  for (const info of infos.sort((a, b) => a.name.localeCompare(b.name))) {
    let estimated = null;
    let error = null;
    try {
      estimated = await db.collection(info.name).estimatedDocumentCount({ maxTimeMS: 60000 });
    } catch (e) {
      error = e.message;
    }
    collections.push({
      name: info.name,
      type: info.type || 'collection',
      estimatedCount: estimated,
      countError: error,
      options: info.options || {},
    });
  }
  return { name: dbName, collections };
}

async function main() {
  const sourceUri = process.env.SOURCE_MONGODB_URI || '';
  const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
  const targetDbName = process.env.MIGRATION_TARGET_DB || dbNameFromUri(targetUri) || 'grooretailerp1';

  console.log('SOURCE host/db :', maskUri(sourceUri));
  console.log('TARGET host/db :', maskUri(targetUri), '-> database:', targetDbName);

  const source = await connect(sourceUri, 'SOURCE');
  const target = await connect(targetUri, 'TARGET');

  let sourceDbs = [];
  let sourceDbError = null;
  try {
    sourceDbs = await listCandidateDatabases(source);
    if (!sourceDbs.length) sourceDbError = 'No non-system databases visible with listDatabases.';
  } catch (e) {
    sourceDbError = e.message;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: { label: maskUri(sourceUri), databases: [] },
    target: { label: maskUri(targetUri), database: targetDbName, collections: [] },
    errors: {},
  };

  for (const name of sourceDbs) {
    try {
      report.source.databases.push(await describeDatabase(source, name));
    } catch (e) {
      report.errors[`source:${name}`] = e.message;
    }
  }
  if (sourceDbError) report.errors.sourceDiscovery = sourceDbError;

  report.target.collections = (await describeDatabase(target, targetDbName)).collections;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log('\nSource databases:');
  for (const db of report.source.databases) {
    console.log(`  ${db.name}: ${db.collections.length} collections`);
    for (const c of db.collections) {
      console.log(`    ${c.name.padEnd(32)} ${c.estimatedCount ?? '?'}`);
    }
  }
  if (report.errors.sourceDiscovery) console.log('  discovery error:', report.errors.sourceDiscovery);

  console.log('\nTarget database:', report.target.database);
  for (const c of report.target.collections) {
    console.log(`  ${c.name.padEnd(36)} ${c.estimatedCount ?? '?'}`);
  }
  console.log('\nWrote', OUT_FILE);

  await source.close();
  await target.close();
}

main().catch((error) => {
  console.error('Inventory failed:', error.message);
  process.exitCode = 1;
});
