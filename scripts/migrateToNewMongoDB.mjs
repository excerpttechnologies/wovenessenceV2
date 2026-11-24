#!/usr/bin/env node

/**
 * MongoDB Data Migration Script
 * 
 * Migrates all collections from MONGODB_URI to NEW_MONGODB_URI
 * EXCLUDING: POS, GRC, and DC data
 * 
 * Usage: node scripts/migrateToNewMongoDB.mjs
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const SOURCE_URI = process.env.MONGODB_URI;
const TARGET_URI = process.env.NEW_MONGODB_URI;

// Collections to EXCLUDE from migration
const EXCLUDED_COLLECTIONS = [
  'pos',
  'possales',
  'posreturn',
  'grc',
  'grcs',
  'purchasegrc',
  'dc',
  'dcs',
  'deliverychallan',
  'delivery',
  'deliveries'
];

// Collections to ALWAYS include (master data and e-commerce)
const PRIORITY_COLLECTIONS = [
  'users',
  'businesses',
  'locations',
  'finyears',
  'items',
  'contacts',
  'suppliers',
  'customers',
  'agents',
  'ecommerceproducts',
  'productgalleries',
  'productclassificationoptions',
  'producttypes',
  'categories',
  'subcategories',
  'barcodelabels',
  'barcodelabelformats',
  'barcodesettings',
  'stockmovements',
  'inventory'
];

async function migrate() {
  if (!SOURCE_URI || !TARGET_URI) {
    console.error('❌ Error: MONGODB_URI and NEW_MONGODB_URI must be set in .env file');
    process.exit(1);
  }

  console.log('🚀 Starting MongoDB Migration...\n');
  console.log('📍 Source:', SOURCE_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
  console.log('📍 Target:', TARGET_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
  console.log('');

  let sourceClient;
  let targetClient;

  try {
    // Connect to both databases
    console.log('🔌 Connecting to source database...');
    sourceClient = new MongoClient(SOURCE_URI);
    await sourceClient.connect();
    
    console.log('🔌 Connecting to target database...');
    targetClient = new MongoClient(TARGET_URI);
    await targetClient.connect();

    const sourceDb = sourceClient.db();
    const targetDb = targetClient.db();

    console.log('✅ Connected to both databases\n');

    // Get all collections from source
    const collections = await sourceDb.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log(`📦 Found ${collectionNames.length} collections in source database\n`);

    // Filter out excluded collections
    const collectionsToMigrate = collectionNames.filter(name => {
      const lowerName = name.toLowerCase();
      const isExcluded = EXCLUDED_COLLECTIONS.some(excluded => 
        lowerName.includes(excluded.toLowerCase())
      );
      return !isExcluded && name !== 'system.indexes';
    });

    console.log(`✅ Will migrate ${collectionsToMigrate.length} collections`);
    console.log(`⏭️  Skipping ${collectionNames.length - collectionsToMigrate.length} collections (POS/GRC/DC data)\n`);

    // Migration statistics
    const stats = {
      total: collectionsToMigrate.length,
      success: 0,
      failed: 0,
      skipped: 0,
      totalDocs: 0
    };

    // Migrate priority collections first
    const priorityToMigrate = collectionsToMigrate.filter(name => 
      PRIORITY_COLLECTIONS.includes(name)
    );
    const otherCollections = collectionsToMigrate.filter(name => 
      !PRIORITY_COLLECTIONS.includes(name)
    );

    console.log('📋 Migration Order:');
    console.log('   1️⃣ Priority collections (master data, e-commerce):', priorityToMigrate.length);
    console.log('   2️⃣ Other collections:', otherCollections.length);
    console.log('');

    // Migrate each collection
    for (const collectionName of [...priorityToMigrate, ...otherCollections]) {
      try {
        const sourceCollection = sourceDb.collection(collectionName);
        const targetCollection = targetDb.collection(collectionName);

        // Count documents
        const count = await sourceCollection.countDocuments();
        
        if (count === 0) {
          console.log(`⏭️  ${collectionName}: Empty collection, skipping`);
          stats.skipped++;
          continue;
        }

        console.log(`📦 Migrating ${collectionName}: ${count} documents...`);

        // Check if target collection already has data
        const targetCount = await targetCollection.countDocuments();
        if (targetCount > 0) {
          console.log(`   ⚠️  Target already has ${targetCount} documents`);
          
          // Drop target collection to start fresh
          await targetCollection.drop().catch(() => {});
          console.log(`   🗑️  Dropped existing collection`);
        }

        // Fetch all documents in batches
        const batchSize = 1000;
        let processed = 0;

        const cursor = sourceCollection.find({});
        let batch = [];

        for await (const doc of cursor) {
          batch.push(doc);

          if (batch.length >= batchSize) {
            await targetCollection.insertMany(batch, { ordered: false });
            processed += batch.length;
            console.log(`   ⏳ Progress: ${processed}/${count} documents`);
            batch = [];
          }
        }

        // Insert remaining documents
        if (batch.length > 0) {
          await targetCollection.insertMany(batch, { ordered: false });
          processed += batch.length;
        }

        // Copy indexes
        const indexes = await sourceCollection.indexes();
        for (const index of indexes) {
          if (index.name === '_id_') continue; // Skip default _id index
          
          try {
            const { name, key, ...options } = index;
            await targetCollection.createIndex(key, { ...options, name });
          } catch (err) {
            // Index might already exist, ignore
          }
        }

        console.log(`   ✅ Completed: ${processed} documents migrated`);
        stats.success++;
        stats.totalDocs += processed;

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        stats.failed++;
      }

      console.log('');
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total Collections: ${stats.total}`);
    console.log(`✅ Successfully Migrated: ${stats.success}`);
    console.log(`⏭️  Skipped (empty): ${stats.skipped}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log(`📄 Total Documents Migrated: ${stats.totalDocs.toLocaleString()}`);
    console.log('='.repeat(60));

    if (stats.failed > 0) {
      console.log('\n⚠️  Some collections failed to migrate. Check the logs above.');
    } else {
      console.log('\n🎉 Migration completed successfully!');
      console.log('\n📝 Next Steps:');
      console.log('   1. Verify data in target database');
      console.log('   2. Update MONGODB_URI to NEW_MONGODB_URI in .env');
      console.log('   3. Restart your application');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close connections
    if (sourceClient) await sourceClient.close();
    if (targetClient) await targetClient.close();
    console.log('\n🔌 Database connections closed');
  }
}

// Run migration
migrate().catch(console.error);
