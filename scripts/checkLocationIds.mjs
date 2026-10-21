import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  console.log('\n📍 All Locations for Business 6a853cdefb266c4358beb548:');
  console.log('='.repeat(70));
  
  const locations = await db.collection('companylocation')
    .find({ businessId: new mongoose.Types.ObjectId('6a853cdefb266c4358beb548') })
    .toArray();
  
  locations.forEach(loc => {
    console.log(`${loc._id} → ${loc.name}`);
  });
  
  console.log('\n🔍 Checking specific IDs from your script:');
  console.log('='.repeat(70));
  
  const warehouse = await db.collection('companylocation').findOne({ 
    name: 'TEMPLE FABRICS WAREHOUSE' 
  });
  console.log(`WAREHOUSE: ${warehouse ? warehouse._id + ' → ' + warehouse.name : 'NOT FOUND'}`);
  
  const hsr = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId('6a858ded9d37d436b1fc02dc') 
  });
  console.log(`HSR TARGET: 6a858ded9d37d436b1fc02dc → ${hsr ? hsr.name : 'NOT FOUND'}`);
  
  await mongoose.disconnect();
}

check();
