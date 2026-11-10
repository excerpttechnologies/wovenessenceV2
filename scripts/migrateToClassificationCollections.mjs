#!/usr/bin/env node

/* Migrate to New Classification Collections (29-10-2026)

   Migrates from old productclassificationoption to new separate collections:
   byweave, byfabric, bycraft, byoccasion, bycolour
   
   Run: node scripts/migrateToClassificationCollections.mjs --business=<businessId>
   
   Schema for each collection:
   {
     businessId: ObjectId,
     type: String ('byWeave', 'byFabric', etc.),
     productType: String ('SAREES', 'FABRICS', 'PLAIN FABRICS', 'DUPATTA', 'SIMPLE'),
     name: String,
     displayOrder: Number,
     isActive: Boolean,
     createdAt: Date,
     updatedAt: Date
   } */

import mongoose from 'mongoose';

const CLASSIFICATION_COLLECTIONS = {
  byWeave: 'byweave',
  byFabric: 'byfabric',
  byCraft: 'bycraft',
  byOccasion: 'byoccasion',
  byColour: 'bycolour',
};

// Default options for SAREES
const SAREE_CLASSIFICATIONS = {
  byWeave: [
    'Kanjivaram', 'Banarasi', 'Chanderi', 'Pochampally', 'Patola',
    'Tussar', 'Maheshwari', 'Paithani', 'Sambalpuri', 'Uppada',
    'Gadwal', 'Kalamkari', 'Ikkat', 'Jamdani', 'Mysore Silk',
    'Bomkai', 'Venkatagiri', 'Mangalgiri', 'Narayanpet', 'Kota Doria',
  ],
  byFabric: [
    'Silk', 'Cotton', 'Georgette', 'Chiffon', 'Crepe',
    'Linen', 'Art Silk', 'Satin', 'Organza', 'Net',
    'Velvet', 'Jacquard', 'Brocade', 'Tissue', 'Tussar Silk',
    'Cotton Silk', 'Katan Silk', 'Raw Silk', 'Mul Cotton',
  ],
  byCraft: [
    'Handloom', 'Powerloom', 'Hand Block Print', 'Screen Print', 'Digital Print',
    'Embroidery', 'Zari Work', 'Stone Work', 'Mirror Work', 'Sequin Work',
    'Thread Work', 'Bandhani', 'Tie & Dye', 'Batik', 'Ajrakh',
    'Kalamkari Print', 'Dabu Print', 'Bagru Print', 'Shibori',
  ],
  byOccasion: [
    'Wedding', 'Party', 'Casual', 'Festive', 'Engagement',
    'Reception', 'Mehendi', 'Sangeet', 'Formal', 'Office Wear',
    'Daily Wear', 'Traditional', 'Contemporary', 'Bridal', 'Pre-Wedding',
    'Pooja', 'Temple Wear', 'Anniversary', 'Diwali', 'Holi',
  ],
};

// Options for FABRICS
const FABRIC_CLASSIFICATIONS = {
  byFabric: [
    'Banarasi Silk Fabric', 'Chanderi Fabric', 'Cotton Fabric', 'Georgette Fabric',
    'Kanchipuram Silk Fabric', 'Linen Fabric', 'Mysore Silk Fabric', 'Organza Fabric',
    'Patola Silk Fabric', 'Paithani Silk Fabric', 'Tussar Silk Fabric',
    'Dupion Silk Fabric', 'Crepe Fabric', 'Chiffon Fabric',
  ],
  byColour: [
    'Beige', 'Black', 'Gold', 'Ivory', 'Lavender', 'Maroon',
    'Mustard', 'Orange', 'Pink', 'Purple', 'Royal Blue', 'Teal',
    'Red', 'Green', 'Yellow', 'Navy Blue', 'Cream', 'Brown',
  ],
};

// Options for PLAIN FABRICS
const PLAIN_FABRIC_CLASSIFICATIONS = {
  byFabric: [
    'Plain Chanderi', 'Plain Cotton', 'Plain Gadwal Silk', 'Plain Kanchipuram Silk',
    'Plain Linen', 'Plain Mysore Silk', 'Plain Patola Silk', 'Plain Tussar Silk',
    'Plain Banarasi Silk', 'Plain Organza', 'Plain Georgette',
  ],
  byColour: [
    'Beige', 'Black', 'Bottle Green', 'Emerald Green', 'Gold',
    'Ivory', 'Lavender', 'Maroon', 'Orange', 'Pink', 'Red', 'Teal',
    'Navy Blue', 'Mustard', 'Cream', 'Purple',
  ],
};

// Options for DUPATTA
const DUPATTA_CLASSIFICATIONS = {
  byFabric: [
    'Chanderi Dupatta', 'Gadwal Silk Dupatta', 'Georgette Dupatta',
    'Kanchipuram Silk Dupatta', 'Organza Dupatta', 'Paithani Silk Dupatta',
    'Patola Silk Dupatta', 'Tussar Silk Dupatta', 'Banarasi Silk Dupatta',
    'Cotton Dupatta', 'Net Dupatta',
  ],
  byColour: [
    'Beige', 'Black', 'Gold', 'Ivory', 'Lavender', 'Maroon',
    'Mustard', 'Orange', 'Pink', 'Purple', 'Royal Blue', 'Teal',
    'Red', 'Green', 'Cream',
  ],
};

async function migrateClassifications(businessId) {
  if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
    console.error('❌ Valid business ID required. Use: --business=<id>');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wovenessence';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const businessObjId = new mongoose.Types.ObjectId(businessId);
    let totalCreated = 0;
    let totalSkipped = 0;

    // Helper to seed one product type
    async function seedProductType(productType, classifications) {
      console.log(`\n📦 Seeding ${productType}...`);

      for (const [type, names] of Object.entries(classifications)) {
        const collectionName = CLASSIFICATION_COLLECTIONS[type];
        if (!collectionName) continue;

        const collection = db.collection(collectionName);
        console.log(`   ${type} (${names.length} items)...`);

        for (let i = 0; i < names.length; i++) {
          const name = names[i];

          // Check if already exists
          const existing = await collection.findOne({
            businessId: { $in: [businessObjId, businessId] },
            productType,
            name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
          });

          if (existing) {
            totalSkipped++;
            continue;
          }

          // Create new option
          const now = new Date();
          await collection.insertOne({
            businessId: businessObjId,
            type,
            productType,
            name,
            displayOrder: i + 1,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });

          totalCreated++;
          process.stdout.write('.');
        }

        console.log(` ✅`);
      }
    }

    // Seed each product type
    await seedProductType('SAREES', SAREE_CLASSIFICATIONS);
    await seedProductType('FABRICS', FABRIC_CLASSIFICATIONS);
    await seedProductType('PLAIN FABRICS', PLAIN_FABRIC_CLASSIFICATIONS);
    await seedProductType('DUPATTA', DUPATTA_CLASSIFICATIONS);

    // Create indexes for better query performance
    console.log('\n🔧 Creating indexes...');
    for (const collectionName of Object.values(CLASSIFICATION_COLLECTIONS)) {
      const collection = db.collection(collectionName);
      await collection.createIndex({ businessId: 1, productType: 1, displayOrder: 1 });
      await collection.createIndex({ businessId: 1, type: 1, isActive: 1 });
      await collection.createIndex({ businessId: 1, productType: 1, name: 1 });
      console.log(`   ✅ ${collectionName}`);
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Created: ${totalCreated}`);
    console.log(`   Skipped: ${totalSkipped} (already exist)`);
    console.log(`   Total: ${totalCreated + totalSkipped}`);

    console.log('\n📊 Summary by collection:');
    for (const [type, collectionName] of Object.entries(CLASSIFICATION_COLLECTIONS)) {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments({
        businessId: { $in: [businessObjId, businessId] }
      });
      console.log(`   ${type}: ${count} documents`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Parse command line args
const args = process.argv.slice(2);
const businessArg = args.find(arg => arg.startsWith('--business='));
const businessId = businessArg ? businessArg.split('=')[1] : null;

if (!businessId) {
  console.error('Usage: node scripts/migrateToClassificationCollections.mjs --business=<businessId>');
  console.error('\nExample: node scripts/migrateToClassificationCollections.mjs --business=507f1f77bcf86cd799439011');
  console.error('\nThis will create classification options for SAREES, FABRICS, PLAIN FABRICS, and DUPATTA');
  console.error('in the new byweave, byfabric, bycraft, byoccasion, bycolour collections.');
  process.exit(1);
}

migrateClassifications(businessId);
