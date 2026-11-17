/* Add TSC TE310 barcode label format to the database
   This script adds the 104mm x 40mm label format for the TSC TE310 printer
   without affecting existing data. Run: node scripts/addTscTe310Format.js */

import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}

const catalogSchema = new mongoose.Schema(
  {
    catalog: { type: String, index: true },
    name: String,
    description: String,
    pageSize: String,
    labelSize: String,
    stickerInRow: Number,
    sort: Number,
  },
  { timestamps: true }
);

const Catalog = mongoose.models.catalog || mongoose.model('catalog', catalogSchema);

async function main() {
  try {
    await mongoose.connect(URI);
    console.log('Connected to MongoDB');

    // Check if the format already exists
    const existing = await Catalog.findOne({
      catalog: 'barcodeLabels',
      name: 'TSC TE310 52x40 (2-up)'
    });

    if (existing) {
      console.log('TSC TE310 2-up format already exists in the database');
      console.log('  Name:', existing.name);
      console.log('  Page Size:', existing.pageSize);
      console.log('  Label Size:', existing.labelSize);
      console.log('  Labels per row:', existing.stickerInRow);
      process.exit(0);
    }

    // Add the TSC TE310 format with 2 labels side-by-side (52mm each)
    const newFormat = await Catalog.create({
      catalog: 'barcodeLabels',
      name: 'TSC TE310 52x40 (2-up)',
      description: 'Sheet Size: 104mm x 40mm, Label Size: 52mm x 40mm, 2 labels side-by-side',
      pageSize: '104 x 40 mm',
      labelSize: '52 x 40 mm',
      stickerInRow: 2,
      sort: 13, // After the existing formats
    });

    console.log('Successfully added TSC TE310 2-up format to the database:');
    console.log('  Name:', newFormat.name);
    console.log('  Page Size:', newFormat.pageSize);
    console.log('  Label Size:', newFormat.labelSize);
    console.log('  Labels per sheet:', newFormat.stickerInRow);

    console.log('\nNext steps:');
    console.log('1. Go to Settings > Barcode Label Settings');
    console.log('2. Select "TSC TE310 52x40 (2-up)" and mark it as Default');
    console.log('3. When printing, select "Label stock" in the Paper dropdown');
    console.log('4. Configure the TSC TE310 printer driver for 104mm x 40mm custom paper size');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
