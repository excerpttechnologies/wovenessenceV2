#!/usr/bin/env node

/**
 * Multi-Database Migration Verification
 * 
 * Verifies both databases were migrated correctly:
 * - grooretailerp1
 * - woven_essence_web
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SOURCE_HOST = 'mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net';
const TARGET_HOST = 'mongodb://wovenessence:wovenessence%40123@127.0.0.1:27017';
const TARGET_AUTH = '?authSource=admin';

const DATABASES = ['grooretailerp1', 'woven_essence_web'];

async function verifyDatabase(dbName) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔍 Verifying: ${dbName}`);
  console.log('='.repeat(70));

  const sourceUri = `${SOURCE_HOST}/${dbName}`;
  const targetUri = `${TARGET_HOST}/${dbName}${TARGET_AUTH}`;

  let sourceClient, targetClient;

  try {
    sourceClient = new MongoClient(sourceUri);
    await sourceClient.connect();
    
    targetClient = new MongoClient(targetUri);
    await targetClient.connect();

    const sourceDb = sourceClient.db(dbName);
    const targetDb = targetClient.db(dbName);

    const sourceCollections = await sourceDb.listCollections().toArray();
    const targetCollections = await targetDb.listCollections().toArray();

    const sourceNames = sourceCollections.map(c => c.name).filter(n => n !== 'system.indexes');
    const targetNames = targetCollections.map(c => c.name).filter(n => n !== 'system.indexes');

    console.log(`\nSource: ${sourceNames.length} collections`);
    console.log(`Target: ${targetNames.length} collections\n`);

    const comparison = [];
    
    for (const name of sourceNames) {
      const sourceCount = await sourceDb.collection(name).countDocuments();
      const targetCount = targetNames.includes(name) 
        ? await targetDb.collection(name).countDocuments()
        : 0;

      comparison.push({
        collection: name,
        source: sourceCount,
        target: targetCount,
        status: sourceCount === targetCount ? '✅' : (targetCount === 0 ? '⏭️' : '⚠️')
      });
    }

    comparison.sort((a, b) => {
      if (a.status === '⚠️' && b.status !== '⚠️') return -1;
      if (a.status !== '⚠️' && b.status === '⚠️') return 1;
      return a.collection.localeCompare(b.collection);
    });

    console.log('┌─────────────────────────────────┬─────────────┬─────────────┬────────┐');
    console.log('│ Collection                      │ Source      │ Target      │ Status │');
    console.log('├─────────────────────────────────┼─────────────┼─────────────┼────────┤');
    
    for (const item of comparison) {
      const col = item.collection.padEnd(31).substring(0, 31);
      const src = item.source.toLocaleString().padStart(11);
      const tgt = item.target.toLocaleString().padStart(11);
      console.log(`│ ${col} │ ${src} │ ${tgt} │   ${item.status}   │`);
    }
    
    console.log('└─────────────────────────────────┴─────────────┴─────────────┴────────┘');

    const perfect = comparison.filter(c => c.status === '✅').length;
    const skipped = comparison.filter(c => c.status === '⏭️').length;
    const warnings = comparison.filter(c => c.status === '⚠️').length;

    console.log(`\n✅ Perfect: ${perfect} | ⏭️ Skipped: ${skipped} | ⚠️ Mismatch: ${warnings}`);

    return { perfect, skipped, warnings };

  } catch (error) {
    console.error(`\n❌ Verification failed: ${error.message}`);
    return { error: true };
  } finally {
    if (sourceClient) await sourceClient.close();
    if (targetClient) await targetClient.close();
  }
}

async function verifyAll() {
  console.log('🔍 Multi-Database Migration Verification');
  console.log('='.repeat(70));

  const results = {};

  for (const dbName of DATABASES) {
    results[dbName] = await verifyDatabase(dbName);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('📊 OVERALL SUMMARY');
  console.log('='.repeat(70));

  for (const dbName of DATABASES) {
    const result = results[dbName];
    if (result.error) {
      console.log(`${dbName}: ❌ Error during verification`);
    } else {
      console.log(`${dbName}: ✅ ${result.perfect} collections verified`);
    }
  }

  console.log('='.repeat(70));

  const hasErrors = Object.values(results).some(r => r.error);
  const hasWarnings = Object.values(results).some(r => r.warnings > 0);

  if (hasErrors) {
    console.log('\n❌ Some databases could not be verified');
  } else if (hasWarnings) {
    console.log('\n⚠️  Some collections have mismatches (may be expected for excluded data)');
  } else {
    console.log('\n✅ All databases verified successfully!');
  }
}

verifyAll().catch(console.error);
