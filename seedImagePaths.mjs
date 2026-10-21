/* ==========================================================================
   seedImagePaths.mjs - barcode image-path seeding (first run 19-10-2026).

   WHAT IT DOES
   Sets  imageUrl = /august_8A_images/<barcodeNo>.jpg  on every barcodeLabel
   row that has a barcodeNo and NO image yet. The app serves that path from
   public/august_8A_images/ on the server, so a barcode shows its photo once
   <barcodeNo>.jpg is put in that folder.

   Rows that already have an imageUrl - photos uploaded through the app
   (/api/files/...) or an earlier /august_8A_images/ path - are NOT touched,
   so it is safe to run again: it only fills the rows that are still empty.

   BEFORE writing, it saves every affected row's previous imageUrl to the
   backup file you name, so the run can be undone.

   HOW TO RUN (from the project root)
     node --env-file=.env seedImagePaths.mjs <backup-file.json>
   e.g.
     node --env-file=.env seedImagePaths.mjs imageurl-backup-2026-10-21.json

   It uses the database in .env (MONGODB_URI) - check which database that is
   before running. No credentials are stored in this file.

   On 19-10-2026 it was run on the production database (grooretailerp1) and
   filled 27,589 rows; 5 uploaded photos were kept.
   ========================================================================== */
import fs from 'fs';
import mongoose from 'mongoose';

const BACKUP = process.argv[2];
if (!BACKUP) {
  console.log('Usage: node --env-file=.env seedImagePaths.mjs <backup-file.json>');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.log('MONGODB_URI is not set - run with --env-file=.env');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const c = db.collection('barcodeLabel');
const filter = {
  barcodeNo: { $nin: [null, ''] },
  $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: '' }],
};

/* backup of the previous value of every row about to change */
const rows = await c.find(filter).project({ _id: 1, barcodeNo: 1, imageUrl: 1 }).toArray();
const backup = rows.map((r) => ({
  _id: String(r._id),
  barcodeNo: r.barcodeNo,
  imageUrl: Object.prototype.hasOwnProperty.call(r, 'imageUrl') ? r.imageUrl : '__MISSING__',
}));
fs.writeFileSync(BACKUP, JSON.stringify({ database: db.databaseName, at: new Date().toISOString(), rows: backup }));
console.log('database:', db.databaseName, '| rows to update:', rows.length, '| backup written:', BACKUP);

const odd = rows.filter((r) => /[\s/\\?#%]/.test(String(r.barcodeNo).trim()));
console.log('barcodes with spaces or path characters (path uses trimmed value):', odd.length, odd.slice(0, 5).map((r) => JSON.stringify(r.barcodeNo)).join(' '));

/* the update: /august_8A_images/<trimmed barcodeNo>.jpg */
const res = await c.updateMany(filter, [
  { $set: { imageUrl: { $concat: ['/august_8A_images/', { $trim: { input: '$barcodeNo' } }, '.jpg'] } } },
]);
console.log('matched', res.matchedCount, 'modified', res.modifiedCount);

/* checks after the run */
const left = await c.countDocuments(filter);
const aug = await c.countDocuments({ imageUrl: { $regex: '^/august_8A_images/' } });
const uploaded = await c.countDocuments({ imageUrl: { $regex: '^/api/files/' } });
const total = await c.estimatedDocumentCount();
console.log('after: rows still without image', left, '| august paths', aug, '| uploaded photos kept', uploaded, '| total rows', total);
const mism = await c.countDocuments({ imageUrl: { $regex: '^/august_8A_images/' }, $expr: { $ne: ['$imageUrl', { $concat: ['/august_8A_images/', { $trim: { input: '$barcodeNo' } }, '.jpg'] }] } });
console.log('august paths not matching their own barcode:', mism);
await mongoose.disconnect();
