/* Import E-commerce Data to Local Database
   
   Imports fetched e-commerce data into your local MongoDB
   
   Run: node scripts/importEcommerceData.js <date>
   Example: node scripts/importEcommerceData.js 2026-10-17 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wovenessence';
const BUSINESS_ID = '6a853cdefb266c4358beb548';

const date = process.argv[2];

if (!date) {
  console.error('\n❌ Error: Date parameter required!\n');
  console.log('Usage: node scripts/importEcommerceData.js <date>');
  console.log('Example: node scripts/importEcommerceData.js 2026-10-17\n');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
const classFile = path.join(dataDir, `ecommerce-classifications-${date}.json`);
const itemsFile = path.join(dataDir, `ecommerce-items-${date}.json`);

// Check files exist
if (!fs.existsSync(classFile) || !fs.existsSync(itemsFile)) {
  console.error('\n❌ Data files not found!');
  console.log(`Looking for:`);
  console.log(`  ${classFile}`);
  console.log(`  ${itemsFile}\n`);
  console.log('Run fetchEcommerceData.js first to download the data\n');
  process.exit(1);
}

/* Import MongoDB models */
let ProductClassificationOption, Item;

async function loadModels() {
  ProductClassificationOption = require('../models/ProductClassificationOption').default;
  Item = require('../models/Item').default;
}

/* Connect to MongoDB */
async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB:', MONGODB_URI.split('@')[1] || 'localhost');
}

/* Import classifications */
async function importClassifications() {
  console.log('\n📦 Importing Product Classifications...\n');
  
  const data = JSON.parse(fs.readFileSync(classFile, 'utf8'));
  const options = data.data || [];
  
  let imported = 0;
  let skipped = 0;
  
  for (const option of options) {
    const existing = await ProductClassificationOption.findOne({
      businessId: BUSINESS_ID,
      type: option.type,
      name: option.name,
    });
    
    if (existing) {
      console.log(`   ⏭️  ${option.type}: "${option.name}" (exists)`);
      skipped++;
      continue;
    }
    
    await ProductClassificationOption.create({
      businessId: BUSINESS_ID,
      type: option.type,
      name: option.name,
      displayOrder: option.displayOrder || 0,
      isActive: true,
    });
    
    console.log(`   ✅ ${option.type}: "${option.name}"`);
    imported++;
  }
  
  console.log(`\n   Total: ${options.length} | New: ${imported} | Skipped: ${skipped}`);
  return imported;
}

/* Import item e-commerce data */
async function importItems() {
  console.log('\n📦 Importing Item E-commerce Data...\n');
  
  const data = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
  const items = data.data || [];
  
  // Build classification mapping
  const classMap = new Map();
  const allOptions = await ProductClassificationOption.find({
    businessId: BUSINESS_ID,
    isActive: true,
  });
  
  for (const opt of allOptions) {
    classMap.set(`${opt.type}:${opt.name}`, opt._id);
  }
  
  console.log(`   Loaded ${classMap.size} classification options\n`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const itemData of items) {
    const localItem = await Item.findOne({
      businessId: BUSINESS_ID,
      itemCode: itemData.itemCode,
    });
    
    if (!localItem) {
      notFound++;
      continue;
    }
    
    // Map classification names to IDs
    const updateData = {
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
    
    // Map classification arrays
    ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].forEach(field => {
      if (itemData[field]?.length > 0) {
        updateData[field] = itemData[field]
          .map(name => classMap.get(`${field}:${name}`))
          .filter(Boolean);
      }
    });
    
    await Item.findByIdAndUpdate(localItem._id, { $set: updateData });
    
    const display = itemData.displayName || itemData.description || itemData.itemCode;
    console.log(`   ✅ ${itemData.itemCode}: ${display.substring(0, 50)}`);
    updated++;
  }
  
  console.log(`\n   Total: ${items.length} | Updated: ${updated} | Not Found: ${notFound}`);
  return updated;
}

/* Main execution */
async function main() {
  console.log('\n🚀 Importing E-commerce Data\n');
  console.log(`Date: ${date}`);
  console.log(`Business: ${BUSINESS_ID}`);
  
  await connectDB();
  await loadModels();
  
  try {
    const classCount = await importClassifications();
    const itemCount = await importItems();
    
    console.log('\n✅ Import Complete!');
    console.log(`   Classifications: ${classCount}`);
    console.log(`   Items: ${itemCount}\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

main();
