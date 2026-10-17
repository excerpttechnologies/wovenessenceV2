#!/usr/bin/env node

/* Fetch E-commerce Data from Production
   
   Fetches product classification options and item e-commerce data from production
   and saves them to local JSON files for review/import.
   
   Usage:
   node scripts/fetchProductionEcommerceData.mjs --business=<businessId>
   
   Environment variables needed:
   - PRODUCTION_URL (default: https://erp.wovenessence.in)
   - PRODUCTION_AUTH_TOKEN (your session token from production site)
   
   Output:
   - data/production-classifications-<date>.json
   - data/production-items-ecommerce-<date>.json */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://erp.wovenessence.in';
const AUTH_TOKEN = process.env.PRODUCTION_AUTH_TOKEN;
const BUSINESS_ID = args.business;

if (!BUSINESS_ID) {
  console.error('❌ Error: --business parameter is required');
  console.log('\nUsage:');
  console.log('  node scripts/fetchProductionEcommerceData.mjs --business=<businessId>');
  process.exit(1);
}

if (!AUTH_TOKEN) {
  console.error('❌ Error: PRODUCTION_AUTH_TOKEN environment variable is required');
  console.log('\nTo get your auth token:');
  console.log('1. Open https://erp.wovenessence.in/admin in your browser');
  console.log('2. Login to your account');
  console.log('3. Open Developer Tools (F12) → Application tab → Cookies');
  console.log('4. Copy the value of "next-auth.session-token" cookie');
  console.log('5. Set it as environment variable:');
  console.log('   set PRODUCTION_AUTH_TOKEN=<your-token>  (Windows)');
  console.log('   export PRODUCTION_AUTH_TOKEN=<your-token>  (Mac/Linux)');
  console.log('6. Run this script again');
  process.exit(1);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const timestamp = new Date().toISOString().split('T')[0];

/* Fetch data from production API with authentication */
async function fetchProduction(endpoint) {
  const url = `${PRODUCTION_URL}${endpoint}`;
  console.log(`📡 Fetching: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Cookie': `next-auth.session-token=${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`❌ Failed to fetch ${endpoint}:`, error.message);
    throw error;
  }
}

/* Main execution */
async function main() {
  console.log('\n🚀 Starting Production E-commerce Data Fetch\n');
  console.log(`Business ID: ${BUSINESS_ID}`);
  console.log(`Production URL: ${PRODUCTION_URL}\n`);
  
  try {
    // 1. Fetch Product Classification Options
    console.log('📦 Step 1: Fetching Product Classification Options...');
    const classificationsUrl = `/api/v1/admin/product-classification-options?businessId=${BUSINESS_ID}`;
    const classifications = await fetchProduction(classificationsUrl);
    
    const classificationsFile = path.join(dataDir, `production-classifications-${timestamp}.json`);
    fs.writeFileSync(classificationsFile, JSON.stringify(classifications, null, 2));
    console.log(`✅ Saved ${classifications.data?.length || 0} classification options to:`);
    console.log(`   ${classificationsFile}\n`);
    
    // 2. Fetch Items with E-commerce Data
    console.log('📦 Step 2: Fetching Items with E-commerce Data...');
    const itemsUrl = `/api/v1/admin/products?businessId=${BUSINESS_ID}&limit=1000`;
    const items = await fetchProduction(itemsUrl);
    
    const itemsFile = path.join(dataDir, `production-items-ecommerce-${timestamp}.json`);
    fs.writeFileSync(itemsFile, JSON.stringify(items, null, 2));
    console.log(`✅ Saved ${items.data?.length || 0} items to:`);
    console.log(`   ${itemsFile}\n`);
    
    // 3. Summary
    console.log('📊 Summary:');
    console.log(`   Classification Options: ${classifications.data?.length || 0}`);
    
    if (classifications.data && classifications.grouped) {
      Object.entries(classifications.grouped).forEach(([type, options]) => {
        console.log(`     - ${type}: ${options.length} options`);
      });
    }
    
    console.log(`   Items with E-commerce Data: ${items.data?.length || 0}`);
    
    if (items.data && items.data.length > 0) {
      const itemsWithProductType = items.data.filter(item => item.productType);
      const itemsWithClassifications = items.data.filter(item => 
        item.byWeave?.length || item.byFabric?.length || item.byCraft?.length || 
        item.byOccasion?.length || item.byColour?.length
      );
      const itemsWithSEO = items.data.filter(item => item.slug || item.seoTitle);
      
      console.log(`     - Items with Product Type: ${itemsWithProductType.length}`);
      console.log(`     - Items with Classifications: ${itemsWithClassifications.length}`);
      console.log(`     - Items with SEO Data: ${itemsWithSEO.length}`);
    }
    
    console.log('\n✅ Data fetch completed successfully!\n');
    console.log('📝 Next Steps:');
    console.log('1. Review the JSON files in the data/ directory');
    console.log('2. Use importProductionEcommerceData.mjs to import into local database');
    console.log('   node scripts/importProductionEcommerceData.mjs --business=<businessId> --date=' + timestamp);
    
  } catch (error) {
    console.error('\n❌ Error during data fetch:', error.message);
    process.exit(1);
  }
}

main();
