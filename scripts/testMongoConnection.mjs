import mongoose from 'mongoose';

async function test() {
  const timeout = setTimeout(() => {
    console.error('❌ Connection timeout after 15 seconds');
    process.exit(1);
  }, 15000);

  try {
    console.log('Testing MongoDB connection...');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ MONGODB_URI not found in environment');
      process.exit(1);
    }
    
    // Hide password in log
    const safeUri = uri.replace(/:[^:@]+@/, ':****@');
    console.log('URI:', safeUri);
    
    console.log('Attempting connection with 8s timeout...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    });
    
    clearTimeout(timeout);
    console.log('✅ Connected successfully!');
    
    const db = mongoose.connection.db;
    const businesses = await db.collection('business').find({}).limit(1).toArray();
    console.log('Found businesses:', businesses.length);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error('❌ Error:', error.name);
    console.error('Message:', error.message);
    if (error.reason) {
      console.error('Reason:', error.reason);
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

test();
