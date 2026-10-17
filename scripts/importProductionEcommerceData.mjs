#!/usr/bin/env node

/* Import Production E-commerce Data to Local Database
   
   Imports product classification options and item e-commerce data from
   previously fetched JSON files into the local development database.
   
   Usage:
   node scripts/importProductionEcommerceData.mjs --business=<businessId> --date=<YYYY-MM-DD>
   
   Optional flags:
   --classifications-only  Only import classification options
   --items-only           Only import item e-commerce data
   --dry-run              Show what would be imported without making changes
   
   Example:
   node scripts/importProductionEcommerceData.mjs --business=6a853cdefb266c4358beb548 --date=2026-10-17 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ProductClassificationOption from '../models/ProductClassificationOption.js';
import Item from '../models/Item.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

const BUSINESS_ID = args.business;
const DATE = args.date;
const DRY_RUN = args['dry-run'];
const CLASSIFICATIONS_ONLY = args['classifications-only'];
const ITEMS_ONLY = args['items-only'];

if (!BUSINESS_ID) {
  console.error('❌ Error: --business parameter is required');
  console.log('\nUsage:');
  console.log('  node scripts/importProductionEcommerceData.mjs --business=<businessId> --date=<YYYY-MM-DD>');
  process.exit(1);
}

if (!DATE) {
  console.error('❌ Error: --date parameter is required (format: YYYY-MM-DD)');
  console.log('\nUsage:');
  console.log('  node scripts/importProductionEcommerceData.mjs --business=<businessId> --date=<YYYY-MM-DD>');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const classificationsFile = path.join(dataDir, `production-classifications-${DATE}.json`);
const itemsFile = path.join(dataDir, `production-items-ecommerce-${DATE}.json`);

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wovenessence';

/* Connect to MongoDB */
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

/* Import classification options */
async function importClassifications() {
  if (!fs.existsSync(classificationsFile)) {
    console.log(`⚠️  Classification file not found: ${classificationsFile}`);
    return 0;
  }
  
  console.log('\n📦 Importing Product Classification Options...');
  const data = JSON.parse(fs.readFileSync(classificationsFile, 'utf8'));
  const options = data.data || [];
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const option of options) {
    try {
      // Check if already exists
      const existing = await ProductClassificationOption.findOne({
        businessId: BUSINESS_ID,
        type: option.type,
        name: option.name,
      });
      
      if (existing) {
        console.log(`   ⏭️  Skipped: ${option.type} - "${option.name}" (already exists)`);
        skipped++;
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would import: ${option.type} - "${option.name}"`);
        imported++;
      } else {
        await ProductClassificationOption.create({
          businessId: BUSINESS_ID,
          type: option.type,
          name: option.name,
          displayOrder: option.displayOrder || 0,
          isActive: option.isActive !== false,
        });
        console.log(`   ✅ Imported: ${option.type} - "${option.name}"`);
        imported++;
      }
    } catch (error) {
      console.error(`   ❌ Error importing "${option.name}":`, error.message);
      errors++;
    }
  }
  
  console.log(`\n   Total: ${options.length} | Imported: ${imported} | Skipped: ${skipped} | Errors: ${errors}`);
  return imported;
}

/* Import item e-commerce data */
async function importItemsEcommerce() {
  if (!fs.existsSync(itemsFile)) {
    console.log(`⚠️  Items file not found: ${itemsFile}`);
    return 0;
  }
  
  console.log('\n📦 Importing Item E-commerce Data...');
  const data = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
  const items = data.data || [];
  
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  
  // Build classification name-to-ID mapping for local database
  const classificationMap = new Map();
  const allClassifications = await ProductClassificationOption.find({
    businessId: BUSINESS_ID,
    isActive: true,
  });
  
  for (const opt of allClassifications) {
    const key = `${opt.type}:${opt.name}`;
    classificationMap.set(key, opt._id);
  }
  
  console.log(`   Loaded ${classificationMap.size} local classification options for mapping\n`);
  
  for (const itemData of items) {
    try {
      // Find local item by SKU
      const localItem = await Item.findOne({
        businessId: BUSINESS_ID,
        itemCode: itemData.itemCode,
      });
      
      if (!localItem) {
        console.log(`   ⏭️  Skipped: ${itemData.itemCode} (not found in local database)`);
        notFound++;
        continue;
      }
      
      // Prepare e-commerce update
      const ecommerceUpdate = {
        productType: itemData.productType,
        displayName: itemData.displayName,
        printDescriptionOverride: itemData.printDescriptionOverride,
        slug: itemData.slug,
        seoTitle: itemData.seoTitle,
        seoDescription: itemData.seoDescription,
        ecommOffPercent: itemData.ecommOffPercent,
        barcodePriceOverride: itemData.barcodePriceOverride,
        barcodeQtyOverride: itemData.barcodeQtyOverride,
        barcodeStatusOverride: itemData.barcodeStatusOverride,
        isFeatured: itemData.isFeatured,
        salesCount: itemData.salesCount,
        weaveDescription: itemData.weaveDescription,
        fabricDescription: itemData.fabricDescription,
        craftDescription: itemData.craftDescription,
        occasionDescription: itemData.occasionDescription,
        colourDescription: itemData.colourDescription,
        additionalImages: itemData.additionalImages,
      };
      
      // Map classification names to local IDs
      const classificationFields = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];
      for (const field of classificationFields) {
        if (itemData[field] && Array.isArray(itemData[field])) {
          ecommerceUpdate[field] = itemData[field]
            .map(name => {
              const key = `${field}:${name}`;
              return classificationMap.get(key);
            })
            .filter(Boolean); // Remove unmapped names
        }
      }
      
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would update: ${itemData.itemCode} - ${itemData.displayName || itemData.description}`);
        updated++;
      } else {
        await Item.findByIdAndUpdate(localItem._id, { $set: ecommerceUpdate });
        console.log(`   ✅ Updated: ${itemData.itemCode} - ${itemData.displayName || itemData.description}`);
        updated++;
      }
    } catch (error) {
      console.error(`   ❌ Error updating "${itemData.itemCode}":`, error.message);
      errors++;
    }
  }
  
  console.log(`\n   Total: ${items.length} | Updated: ${updated} | Not Found: ${notFound} | Errors: ${errors}`);
  return updated;
}

/* Main execution */
async function main() {
  console.log('\n🚀 Starting Production E-commerce Data Import\n');
  console.log(`Business ID: ${BUSINESS_ID}`);
  console.log(`Date: ${DATE}`);
  console.log(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO'}\n`);
  
  await connectDB();
  
  try {
    let totalImported = 0;
    
    if (!ITEMS_ONLY) {
      totalImported += await importClassifications();
    }
    
    if (!CLASSIFICATIONS_ONLY) {
      totalImported += await importItemsEcommerce();
    }
    
    console.log('\n✅ Import completed successfully!');
    console.log(`   Total records processed: ${totalImported}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made to the database');
      console.log('   Run without --dry-run flag to actually import the data');
    }
    
  } catch (error) {
    console.error('\n❌ Error during import:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB\n');
  }
}

main();
