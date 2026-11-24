#!/usr/bin/env node

/**
 * MongoDB Multi-Database Migration Script
 * 
 * Migrates TWO databases from cloud to local MongoDB:
 * 1. grooretailerp1 (ERP - excluding POS/GRC/DC)
 * 2. woven_essence_web (Website/E-commerce - ALL data)
 * 
 * Usage: node scripts/migrateBothDatabases.mjs
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Source (Cloud MongoDB)
const SOURCE_HOST = 'mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net';

// Target (Local MongoDB)
const TARGET_HOST = 'mongodb://wovenessence:wovenessence%40123@127.0.0.1:27017';
const TARGET_AUTH = '?authSource=admin';

// Databases to migrate
const DATABASES = [
  {
    name: 'grooretailerp1',
    description: 'ERP Database',
    excludeCollections: ['pos', 'possales', 'posreturn', 'grc', 'grcs', 'purchasegrc', 'dc', 'dcs', 'deliverychallan', 'delivery', 'deliveries']
  },
  {
    name: 'woven_essence_web',
    description: 'Website/E-commerce Database',
    excludeCollections: [] // Migrate everything
  }
];

async function migrateDatabase(dbConfig) {
  console.log('\n' + '='.repeat(70));
  console.log(`📦 Migrating: ${dbConfig.name} (${dbConfig.description})`);
  console.log('='.repeat(70));

  const sourceUri = `${SOURCE_HOST}/${dbConfig.name}`;
  const targetUri = `${TARGET_HOST}/${dbConfig.name}${TARGET_AUTH}`;

  let sourceClient;
  let targetClient;

  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    totalDocs: 0
  };

  try {
    // Connect to source
    console.log('🔌 Connecting to source...');
    sourceClient = new MongoClient(sourceUri);
    await sourceClient.connect();
    
    // Connect to target
    console.log('🔌 Connecting to target...');
    targetClient = new MongoClient(targetUri);
    await targetClient.connect();

    const sourceDb = sourceClient.db(dbConfig.name);
    const targetDb = targetClient.db(dbConfig.name);

    console.log('✅ Connected to both instances\n');

    // Get all collections
    const collections = await sourceDb.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log(`📋 Found ${collectionNames.length} collections`);

    // Filter collections
    const collectionsToMigrate = collectionNames.filter(name => {
      const lowerName = name.toLowerCase();
      const isExcluded = dbConfig.excludeCollections.some(excluded => 
        lowerName.includes(excluded.toLowerCase())
      );
      return !isExcluded && name !== 'system.indexes';
    });

    if (dbConfig.excludeCollections.length > 0) {
      console.log(`✅ Will migrate ${collectionsToMigrate.length} collections`);
      console.log(`⏭️  Skipping ${collectionNames.length - collectionsToMigrate.length} collections`);
    } else {
      console.log(`✅ Will migrate ALL ${collectionsToMigrate.length} collections`);
    }

    stats.total = collectionsToMigrate.length;

    // Migrate each collection
    for (const collectionName of collectionsToMigrate) {
      try {
        const sourceCollection = sourceDb.collection(collectionName);
        const targetCollection = targetDb.collection(collectionName);

        const count = await sourceCollection.countDocuments();
        
        if (count === 0) {
          console.log(`\n⏭️  ${collectionName}: Empty, skipping`);
          stats.skipped++;
          continue;
        }

        console.log(`\n📦 ${collectionName}: ${count} documents`);

        // Check target
        const targetCount = await targetCollection.countDocuments();
        if (targetCount > 0) {
          console.log(`   🗑️  Dropping existing ${targetCount} documents`);
          await targetCollection.drop().catch(() => {});
        }

        // Migrate in batches
        const batchSize = 1000;
        let processed = 0;
        const cursor = sourceCollection.find({});
        let batch = [];

        for await (const doc of cursor) {
          batch.push(doc);
          if (batch.length >= batchSize) {
            await targetCollection.insertMany(batch, { ordered: false });
            processed += batch.length;
            if (count > batchSize) {
              console.log(`   ⏳ ${processed}/${count} documents`);
            }
            batch = [];
          }
        }

        if (batch.length > 0) {
          await targetCollection.insertMany(batch, { ordered: false });
          processed += batch.length;
        }

        // Copy indexes
        const indexes = await sourceCollection.indexes();
        for (const index of indexes) {
          if (index.name === '_id_') continue;
          try {
            const { name, key, ...options } = index;
            await targetCollection.createIndex(key, { ...options, name });
          } catch (err) {
            // Index might exist, ignore
          }
        }

        console.log(`   ✅ Migrated ${processed} documents`);
        stats.success++;
        stats.totalDocs += processed;

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        stats.failed++;
      }
    }

    // Database summary
    console.log('\n' + '-'.repeat(70));
    console.log(`📊 ${dbConfig.name} Summary:`);
    console.log(`   Collections: ${stats.success}/${stats.total} migrated`);
    console.log(`   Documents: ${stats.totalDocs.toLocaleString()}`);
    console.log(`   Skipped: ${stats.skipped} (empty)`);
    console.log(`   Failed: ${stats.failed}`);
    console.log('-'.repeat(70));

    return stats;

  } catch (error) {
    console.error(`\n❌ Database migration failed: ${error.message}`);
    return { ...stats, error: true };
  } finally {
    if (sourceClient) await sourceClient.close();
    if (targetClient) await targetClient.close();
  }
}

async function migrateAll() {
  console.log('🚀 Multi-Database MongoDB Migration');
  console.log('='.repeat(70));
  console.log('Source: Cloud MongoDB (Atlas)');
  console.log('Target: Local MongoDB (127.0.0.1:27017)');
  console.log('');
  console.log('Databases:');
  DATABASES.forEach((db, i) => {
    console.log(`  ${i + 1}. ${db.name} - ${db.description}`);
  });
  console.log('='.repeat(70));

  const allStats = {
    databases: 0,
    totalCollections: 0,
    totalDocuments: 0,
    errors: []
  };

  for (const dbConfig of DATABASES) {
    const stats = await migrateDatabase(dbConfig);
    
    allStats.databases++;
    allStats.totalCollections += stats.success;
    allStats.totalDocuments += stats.totalDocs;
    
    if (stats.error) {
      allStats.errors.push(dbConfig.name);
    }

    // Small delay between databases
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final summary
  console.log('\n\n' + '='.repeat(70));
  console.log('🎉 FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Databases Migrated: ${allStats.databases}`);
  console.log(`Total Collections: ${allStats.totalCollections}`);
  console.log(`Total Documents: ${allStats.totalDocuments.toLocaleString()}`);
  
  if (allStats.errors.length > 0) {
    console.log(`❌ Errors in: ${allStats.errors.join(', ')}`);
  } else {
    console.log('✅ All databases migrated successfully!');
  }
  
  console.log('='.repeat(70));

  console.log('\n📝 Next Steps:');
  console.log('   1. Run verification: node scripts/verifyBothDatabases.mjs');
  console.log('   2. Update .env file to use local MongoDB URIs');
  console.log('   3. Restart your application');
}

migrateAll().catch(console.error);
