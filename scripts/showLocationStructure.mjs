#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n📍 HSR Location Document Structure:\n');

const hsrLoc = await db.collection('companylocation').findOne({ 
  _id: new mongoose.Types.ObjectId('6a858ded9d37d436b1fc02dc') 
});

if (hsrLoc) {
  console.log(JSON.stringify(hsrLoc, null, 2));
} else {
  console.log('❌ Not found');
}

console.log('\n\n📋 All Locations:\n');

const allLocs = await db.collection('companylocation').find({}).toArray();
allLocs.forEach((loc, i) => {
  console.log(`${i + 1}. ${loc.locationName || loc.name || loc.locName || 'UNNAMED'}`);
  console.log(`   ID: ${loc._id}`);
  console.log(`   Keys: ${Object.keys(loc).join(', ')}`);
  console.log();
});

await mongoose.disconnect();
