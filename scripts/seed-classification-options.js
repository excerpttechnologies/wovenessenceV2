/* Seed script to add sample classification options for testing
   
   Usage: node scripts/seed-classification-options.js YOUR_BUSINESS_ID
   
   This will add sample options for SAREES product type across all classification types.
*/

import dbConnect from '../lib/db.js';
import { classificationCollection } from '../lib/classificationCollections.js';
import { Types } from 'mongoose';

const SAREES_SAMPLE_DATA = {
  byWeave: ['Handloom', 'Power Loom', 'Jacquard', 'Brocade'],
  byFabric: ['Banarasi Silk', 'Kanchipuram Silk', 'Tussar Silk', 'Chanderi', 'Cotton'],
  byCraft: ['Hand Embroidered', 'Zari Work', 'Block Print', 'Kalamkari'],
  byOccasion: ['Wedding', 'Festival', 'Party', 'Casual', 'Formal'],
};

async function seed() {
  try {
    const businessId = process.argv[2];
    
    if (!businessId || businessId.length !== 24) {
      console.error('Usage: node scripts/seed-classification-options.js YOUR_BUSINESS_ID');
      console.error('Business ID must be a 24-character MongoDB ObjectId');
      process.exit(1);
    }

    await dbConnect();
    console.log('\n✓ Connected to database');

    const businessObjectId = new Types.ObjectId(businessId);
    let totalAdded = 0;

    for (const [type, names] of Object.entries(SAREES_SAMPLE_DATA)) {
      const collection = classificationCollection(type);
      console.log(`\n→ Processing ${type}...`);

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        
        // Check if already exists
        const existing = await collection.findOne({
          businessId: businessObjectId,
          productType: 'SAREES',
          name: { $regex: `^${name}$`, $options: 'i' },
        });

        if (existing) {
          console.log(`  ⊙ "${name}" already exists, skipping`);
          continue;
        }

        // Insert new option
        const doc = {
          businessId: businessObjectId,
          type,
          productType: 'SAREES',
          name: name.toUpperCase(),
          displayOrder: i,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await collection.insertOne(doc);
        console.log(`  ✓ Added "${name}"`);
        totalAdded++;
      }
    }

    console.log(`\n✅ Seeding complete! Added ${totalAdded} new options for SAREES product type.`);
    console.log('\nYou can now:');
    console.log('1. Go to /admin/ecommerce/product-eccom/add');
    console.log('2. Select Product Type: SAREES');
    console.log('3. See the options in By Weave, By Fabric, By Craft, and By Occasion dropdowns');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
