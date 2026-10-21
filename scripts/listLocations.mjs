import mongoose from 'mongoose';

async function list() {
  await mongoose.connect(process.env.MONGODB_URI);
  const locs = await mongoose.connection.db.collection('companylocation')
    .find({}, { projection: { name: 1, businessId: 1 } }).toArray();
  
  console.log('\n📍 Available Locations:');
  console.log('='.repeat(60));
  locs.forEach((loc, i) => {
    console.log(`${i+1}. "${loc.name}" (businessId: ${loc.businessId})`);
  });
  console.log('='.repeat(60));
  console.log(`Total: ${locs.length} locations\n`);
  
  await mongoose.disconnect();
}

list().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
