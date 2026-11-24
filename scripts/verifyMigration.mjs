#!/usr/bin/env node

/**
 * MongoDB Migration Verification Script
 * 
 * Compares document counts between source and target databases
 * 
 * Usage: node scripts/verifyMigration.mjs
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SOURCE_URI = process.env.MONGODB_URI;
const TARGET_URI = process.env.NEW_MONGODB_URI;

async function verify() {
  if (!SOURCE_URI || !TARGET_URI) {
    console.error('❌ Error: MONGODB_URI and NEW_MONGODB_URI must be set');
    process.exit(1);
  }

  console.log('🔍 Verifying MongoDB Migration...\n');

  let sourceClient;
  let targetClient;

  try {
    sourceClient = new MongoClient(SOURCE_URI);
    await sourceClient.connect();
    
    targetClient = new MongoClient(TARGET_URI);
    await targetClient.connect();

    const sourceDb = sourceClient.db();
    const targetDb = targetClient.db();

    // Get all collections
    const sourceCollections = await sourceDb.listCollections().toArray();
    const targetCollections = await targetDb.listCollections().toArray();

    const sourceNames = sourceCollections.map(c => c.name).filter(n => n !== 'system.indexes');
    const targetNames = targetCollections.map(c => c.name).filter(n => n !== 'system.indexes');

    console.log('📊 Collection Comparison:\n');
    console.log(`Source collections: ${sourceNames.length}`);
    console.log(`Target collections: ${targetNames.length}\n`);

    // Compare document counts
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

    // Sort by status (problems first)
    comparison.sort((a, b) => {
      if (a.status === '⚠️' && b.status !== '⚠️') return -1;
      if (a.status !== '⚠️' && b.status === '⚠️') return 1;
      return a.collection.localeCompare(b.collection);
    });

    // Print table
    console.log('┌─────────────────────────────────┬─────────────┬─────────────┬────────┐');
    console.log('│ Collection                      │ Source Docs │ Target Docs │ Status │');
    console.log('├─────────────────────────────────┼─────────────┼─────────────┼────────┤');
    
    for (const item of comparison) {
      const col = item.collection.padEnd(31).substring(0, 31);
      const src = item.source.toLocaleString().padStart(11);
      const tgt = item.target.toLocaleString().padStart(11);
      console.log(`│ ${col} │ ${src} │ ${tgt} │   ${item.status}   │`);
    }
    
    console.log('└─────────────────────────────────┴─────────────┴─────────────┴────────┘');

    // Summary
    const perfect = comparison.filter(c => c.status === '✅').length;
    const skipped = comparison.filter(c => c.status === '⏭️').length;
    const warnings = comparison.filter(c => c.status === '⚠️').length;

    console.log('\n📈 Summary:');
    console.log(`   ✅ Perfect match: ${perfect} collections`);
    console.log(`   ⏭️  Skipped (not in target): ${skipped} collections`);
    console.log(`   ⚠️  Count mismatch: ${warnings} collections`);

    if (warnings > 0) {
      console.log('\n⚠️  Warning: Some collections have different document counts!');
      console.log('   This might be expected if you excluded certain data (POS/GRC/DC)');
    } else {
      console.log('\n✅ Verification complete - all migrated collections match!');
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    if (sourceClient) await sourceClient.close();
    if (targetClient) await targetClient.close();
  }
}

verify().catch(console.error);
