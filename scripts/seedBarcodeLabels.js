/* Seed all barcode label formats including TSC TE310
   This script adds all barcode label formats to the database
   Run: node scripts/seedBarcodeLabels.js */

const mongoose = require('mongoose');
const { config } = require('dotenv');

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

const LABELS = [
  ['TF 50 x 40', 'Sheet Size: 100mm x 40mm, Label Size: 50mm x 40mm, Labels per sheet: 2', '100 x 40 mm', '50 x 40 mm', 2, 0],
  ['LL - 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2, 1],
  ['KS 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2, 2],
  ['MA 38 x 25 mm 1Ups', 'Sheet Size: 38mm x 25mm, Label Size: 38mm x 25mm, Labels per sheet: 1', '38 x 25 mm', '38 x 25 mm', 1, 3],
  ['BS1 58*78mm 1Ups', 'Sheet Size: 58mm x 78mm, Label Size: 58mm x 78mm, Labels per sheet: 1', '58 x 78 mm', '58 x 78 mm', 1, 4],
  ['BS2 58*78mm 1Ups', 'Sheet Size: 58mm x 77mm, Label Size: 58mm x 78mm, Labels per sheet: 1', '58 x 78 mm', '58 x 78 mm', 1, 5],
  ['RT 72 x 116 mm', 'Sheet Size: 72mm x 116mm, Label Size: 72mm x 116mm, Labels per sheet: 2', '72 x 116 mm', '72 x 116 mm', 2, 6],
  ['MF 100 x 50 mm', 'Sheet Size: 100mm x 50mm, Label Size: 50mm x 50mm, Labels per sheet: 2', '100 x 50 mm', '50 x 50 mm', 2, 7],
  ['MNY 58 X 38', 'Sheet Size: 58mm x 38mm, Label Size: 58mm x 38mm, Labels per sheet: 1', '58 x 38 mm', '58 x 38 mm', 1, 8],
  ['BGS 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2, 9],
  ['SAS 50 x 25mm', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1, 10],
  ['BGS V2 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2, 11],
  ['KVC 50 x 25', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25mm, Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1, 12],
  ['TSC TE310 104x40', 'Sheet Size: 104mm x 40mm, Label Size: 104mm x 40mm, Labels per sheet: 1', '104 x 40 mm', '104 x 40 mm', 1, 13],
];

async function main() {
  try {
    await mongoose.connect(URI);
    console.log('Connected to MongoDB');

    // Delete existing barcode label formats
    const deleteResult = await Catalog.deleteMany({ catalog: 'barcodeLabels' });
    console.log('Deleted', deleteResult.deletedCount, 'existing barcode label formats');

    // Insert all formats
    const insertResult = await Catalog.insertMany(
      LABELS.map(([name, description, pageSize, labelSize, stickerInRow, sort]) => ({
        catalog: 'barcodeLabels',
        name,
        description,
        pageSize,
        labelSize,
        stickerInRow,
        sort,
      }))
    );

    console.log('Successfully added', insertResult.length, 'barcode label formats:');
    insertResult.forEach((f) => {
      console.log(`  ${f.sort}. ${f.name} - Page: ${f.pageSize}, Label: ${f.labelSize}`);
    });

    console.log('\nNext steps:');
    console.log('1. Go to Settings > Barcode Label Settings');
    console.log('2. Select the formats you want to use');
    console.log('3. Mark "TSC TE310 104x40" as Default for TSC TE310 printing');
    console.log('4. When printing, select "Label stock" in the Paper dropdown');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
