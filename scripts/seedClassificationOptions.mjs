#!/usr/bin/env node

/* Seed Product Classification Options
   
   Adds common classification options for SAREES and FABRICS
   Run: node scripts/seedClassificationOptions.mjs --business=<businessId>
   
   Creates:
   - By Weave: Kanjivaram, Banarasi, Chanderi, Pochampally, etc.
   - By Fabric: Silk, Cotton, Georgette, Chiffon, etc.
   - By Craft: Handloom, Powerloom, Hand Block Print, etc.
   - By Occasion: Wedding, Party, Casual, Festive, etc.
   - By Colour: Red, Blue, Green, Pink, etc. */

import mongoose from 'mongoose';
import ProductClassificationOption, { CLASSIFICATION_TYPES } from '../models/ProductClassificationOption.js';

const CLASSIFICATIONS = {
  byWeave: [
    'Kanjivaram', 'Banarasi', 'Chanderi', 'Pochampally', 'Patola',
    'Tussar', 'Maheshwari', 'Paithani', 'Sambalpuri', 'Uppada',
    'Gadwal', 'Kalamkari', 'Ikkat', 'Jamdani', 'Mysore Silk',
  ],
  byFabric: [
    'Silk', 'Cotton', 'Georgette', 'Chiffon', 'Crepe',
    'Linen', 'Art Silk', 'Satin', 'Organza', 'Net',
    'Velvet', 'Jacquard', 'Brocade', 'Tissue', 'Tussar Silk',
  ],
  byCraft: [
    'Handloom', 'Powerloom', 'Hand Block Print', 'Screen Print', 'Digital Print',
    'Embroidery', 'Zari Work', 'Stone Work', 'Mirror Work', 'Sequin Work',
    'Thread Work', 'Bandhani', 'Tie & Dye', 'Batik', 'Ajrakh',
  ],
  byOccasion: [
    'Wedding', 'Party', 'Casual', 'Festive', 'Engagement',
    'Reception', 'Mehendi', 'Sangeet', 'Formal', 'Office Wear',
    'Daily Wear', 'Traditional', 'Contemporary', 'Bridal', 'Pre-Wedding',
  ],
  byColour: [
    'Red', 'Blue', 'Green', 'Yellow', 'Pink',
    'Purple', 'Orange', 'Black', 'White', 'Beige',
    'Gold', 'Silver', 'Maroon', 'Navy Blue', 'Teal',
    'Magenta', 'Peach', 'Cream', 'Brown', 'Grey',
    'Multicolour', 'Pastel', 'Neon', 'Metallic',
  ],
};

async function seedClassifications(businessId) {
  if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
    console.error('❌ Valid business ID required. Use: --business=<id>');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wovenessence';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    let created = 0;
    let skipped = 0;

    for (const [type, names] of Object.entries(CLASSIFICATIONS)) {
      console.log(`\n📦 Processing ${type}...`);

      for (let i = 0; i < names.length; i++) {
        const name = names[i];

        // Check if already exists
        const existing = await ProductClassificationOption.findOne({
          businessId,
          type,
          name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create new option
        await ProductClassificationOption.create({
          businessId,
          type,
          name,
          displayOrder: i + 1,
          isActive: true,
        });

        created++;
        process.stdout.write('.');
      }

      console.log(` ${names.length} items`);
    }

    console.log(`\n✅ Seed complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped} (already exist)`);
    console.log(`   Total: ${created + skipped}`);

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
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
  console.error('Usage: node scripts/seedClassificationOptions.mjs --business=<businessId>');
  console.error('\nExample: node scripts/seedClassificationOptions.mjs --business=507f1f77bcf86cd799439011');
  process.exit(1);
}

seedClassifications(businessId);
