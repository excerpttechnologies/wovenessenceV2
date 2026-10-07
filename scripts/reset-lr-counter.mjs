/* Reset LR counter for current financial year to start from 001.
   Run with: node scripts/reset-lr-counter.mjs */

import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orbit_erp';

const CounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

const Counter = mongoose.model('counter', CounterSchema, 'counter');

function counterKey(name, { businessId, locationId, finYear } = {}) {
  return [
    String(name || ''),
    String(businessId || '-'),
    String(locationId || '-'),
    String(finYear || '-'),
  ].join('|');
}

async function resetLRCounter() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log('Connected to MongoDB');

  // Current financial year
  const finYear = '2026-2027';
  const prefix = 'LR/26/';
  const name = 'series:' + prefix;

  // Find all counters for this LR series across all businesses
  const counters = await Counter.find({
    key: { $regex: '^' + name.replace('/', '\\/') + '\\|' }
  }).lean();

  console.log(`Found ${counters.length} LR counter(s) for ${finYear}:`);
  counters.forEach(c => console.log(`  ${c.key} -> seq: ${c.seq}`));

  // Reset each counter to 0 (so next number will be 001)
  for (const counter of counters) {
    await Counter.updateOne(
      { _id: counter._id },
      { $set: { seq: 0 } }
    );
    console.log(`Reset ${counter.key} to 0`);
  }

  // Also delete any counter with seq > 0 for this series to force fresh start
  // This handles the case where counter doesn't exist yet but will be created
  const deleted = await Counter.deleteMany({
    key: { $regex: '^' + name.replace('/', '\\/') + '\\|' },
    seq: { $gt: 0 }
  });
  console.log(`Deleted ${deleted.deletedCount} counter(s) with seq > 0`);

  console.log('LR counter reset complete. Next LR number will be LR/26/001');
  await mongoose.disconnect();
}

resetLRCounter().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});