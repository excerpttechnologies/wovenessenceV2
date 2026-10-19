/* Fetch E-commerce Data from Production
   
   Simple script to fetch all e-commerce classifications and item data
   from https://erp.wovenessence.in
   
   Run: node scripts/fetchEcommerceData.js */

const fs = require('fs');
const path = require('path');

// Configuration
const PRODUCTION_URL = 'https://erp.wovenessence.in';
const BUSINESS_ID = '6a853cdefb266c4358beb548'; // Your business ID

// Get auth token from .env or command line
const AUTH_TOKEN = process.env.PRODUCTION_AUTH_TOKEN || process.argv[2];

if (!AUTH_TOKEN) {
  console.error('\n❌ Error: Authentication token required!\n');
  console.log('Get your token:');
  console.log('1. Login to https://erp.wovenessence.in/admin');
  console.log('2. Press F12 → Application → Cookies');
  console.log('3. Copy "next-auth.session-token" value\n');
  console.log('Then run either:');
  console.log('  node scripts/fetchEcommerceData.js <your-token>');
  console.log('  OR add to .env: PRODUCTION_AUTH_TOKEN=<your-token>\n');
  process.exit(1);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/* Fetch from production API */
async function fetchAPI(endpoint) {
  const url = `${PRODUCTION_URL}${endpoint}`;
  console.log(`📡 Fetching: ${endpoint}`);
  
  const response = await fetch(url, {
    headers: {
      'Cookie': `next-auth.session-token=${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

/* Main execution */
async function main() {
  console.log('\n🚀 Fetching E-commerce Data from Production\n');
  console.log(`Business: ${BUSINESS_ID}`);
  console.log(`URL: ${PRODUCTION_URL}\n`);
  
  const timestamp = new Date().toISOString().split('T')[0];
  
  try {
    // 1. Fetch Classification Options
    console.log('📦 Fetching Product Classifications...');
    const classifications = await fetchAPI(`/api/v1/admin/product-classification-options?businessId=${BUSINESS_ID}`);
    
    const classFile = path.join(dataDir, `ecommerce-classifications-${timestamp}.json`);
    fs.writeFileSync(classFile, JSON.stringify(classifications, null, 2));
    
    console.log(`✅ Saved ${classifications.data?.length || 0} classifications`);
    
    if (classifications.grouped) {
      Object.entries(classifications.grouped).forEach(([type, items]) => {
        console.log(`   ${type}: ${items.length} options`);
      });
    }
    
    // 2. Fetch Items with E-commerce Data
    console.log('\n📦 Fetching Items with E-commerce Data...');
    const items = await fetchAPI(`/api/v1/admin/products?businessId=${BUSINESS_ID}&limit=5000`);
    
    const itemsFile = path.join(dataDir, `ecommerce-items-${timestamp}.json`);
    fs.writeFileSync(itemsFile, JSON.stringify(items, null, 2));
    
    console.log(`✅ Saved ${items.data?.length || 0} items`);
    
    // Show statistics
    if (items.data) {
      const withType = items.data.filter(i => i.productType);
      const withFabric = items.data.filter(i => i.byFabric?.length > 0);
      const withWeave = items.data.filter(i => i.byWeave?.length > 0);
      const withSEO = items.data.filter(i => i.slug || i.seoTitle);
      
      console.log(`   With Product Type: ${withType.length}`);
      console.log(`   With Fabric: ${withFabric.length}`);
      console.log(`   With Weave: ${withWeave.length}`);
      console.log(`   With SEO: ${withSEO.length}`);
    }
    
    console.log('\n✅ Done! Files saved to data/ directory:');
    console.log(`   ${path.basename(classFile)}`);
    console.log(`   ${path.basename(itemsFile)}`);
    console.log('\n📝 Review the files, then import with:');
    console.log(`   node scripts/importEcommerceData.js ${timestamp}\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('- Check if you are logged in to production');
    console.log('- Verify your auth token is still valid');
    console.log('- Try getting a fresh token from the browser\n');
    process.exit(1);
  }
}

main();
