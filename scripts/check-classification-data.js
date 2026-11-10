/* Quick script to check if classification data exists */
import dbConnect from '../lib/db.js';
import { classificationCollection } from '../lib/classificationCollections.js';

async function checkData() {
  try {
    await dbConnect();
    
    const types = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];
    
    console.log('\n=== Checking Classification Data ===\n');
    
    for (const type of types) {
      const collection = classificationCollection(type);
      const count = await collection.countDocuments();
      const sampleDocs = await collection.find().limit(3).toArray();
      
      console.log(`${type}:`);
      console.log(`  Total documents: ${count}`);
      if (sampleDocs.length > 0) {
        console.log('  Sample documents:');
        sampleDocs.forEach(doc => {
          console.log(`    - ${doc.name} (productType: ${doc.productType || 'N/A'}, businessId: ${doc.businessId})`);
        });
      } else {
        console.log('  ⚠️  No documents found!');
      }
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkData();
