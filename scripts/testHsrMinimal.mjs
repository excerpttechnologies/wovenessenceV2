console.log('1. Starting script');

import fs from 'fs';
import path from 'path';
console.log('2. Basic imports loaded');

import mongoose from 'mongoose';
console.log('3. Mongoose loaded');

import XLSX from 'xlsx';
console.log('4. XLSX loaded');

console.log('5. Loading BarcodeLabel...');
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
console.log('6. BarcodeLabel loaded');

console.log('7. Loading MOVEMENT_TYPES...');
import { MOVEMENT_TYPES } from '@/models/StockMovement';
console.log('8. MOVEMENT_TYPES loaded');

console.log('9. Loading inventory functions...');
import { applyMovement, withTransaction } from '@/lib/inventory';
console.log('10. Inventory functions loaded');

console.log('11. Loading helper functions...');
import { encodeRate } from '@/lib/purchaseRateCode';
import { uomTypeOf } from '@/lib/barcodeUnits';
import { contactCollection } from '@/lib/contactStorage';
console.log('12. All imports loaded successfully!');

async function test() {
  console.log('13. Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000
  });
  console.log('14. Connected!');
  await mongoose.disconnect();
  console.log('15. Done!');
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
