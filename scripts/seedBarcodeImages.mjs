/* Writes the barcode photos that ship under public/ onto the barcode rows.

   Why, when lib/inventory.js already falls back to the folder
   -----------------------------------------------------------
   That fallback covers everything routed through imageUrl() - the till scan,
   the Inventory Barcode List, the barcode-item list. It does NOT cover code
   that reads barcodeLabel.imageUrl straight off the document, and at least
   one place does: app/api/item/route.js builds barcodeImageByCode from
   `row.imageUrl`, so an item searched by barcode still comes back pictureless.
   Rather than thread the resolver through every such reader, this stamps the
   URL onto the row once and both paths agree.

   public/ is served at the site root by Next, so a file on disk at
   public/august_8A_images/8A1002.jpg is reachable at
   /august_8A_images/8A1002.jpg, and imageUrl() passes a value starting with
   "/" through untouched. No upload, no second storage system.

   What it will not do
   -------------------
   Overwrite a photo that still works. Data URIs and ordinary URLs are left
   exactly as they are. Nothing is inserted or deleted, and no field other
   than imageUrl is touched.

   The one exception is a URL that has told us itself that it is dead: the
   legacy ERP stored S3 presigned links carrying X-Amz-Date and
   X-Amz-Expires=300, so each was only ever valid for five minutes after it
   was signed. 51 of these are on file, signed 2026-08-08, and they answer
   403 today. That is not a photo, it is a broken link standing in the way of
   one - so where the expiry stamped on the URL has passed AND we have the
   real file on disk, the file wins. A presigned URL still inside its window
   is left alone; --keep-expired turns even that off.

   Matching is on barcodeGenerated OR oldBarcode - the August set is filed
   under the code a unit was originally labelled with, which for a relabelled
   unit is the old one.

     npm run seed:barcode-images          # dry run, changes nothing
     npm run seed:barcode-images:apply    # writes, after a JSON backup

   Options
     --dir=<name>   folder under public/ to read (default august_8A_images)
*/

import mongoose from 'mongoose';
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');
const KEEP_EXPIRED = process.argv.includes('--keep-expired');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || '';
const DIR_NAME = arg('dir') || 'august_8A_images';

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/seedBarcodeImages.mjs');
  process.exit(1);
}

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'public', DIR_NAME);
if (!existsSync(DIR)) { console.error('No such folder: ' + DIR); process.exit(1); }

const up = (v) => String(v || '').trim().toUpperCase();

/* ------------------------------------------------------------------ disk -- */

const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
const byStem = new Map();
for (const file of files) byStem.set(up(file.replace(/\.[^.]+$/, '')), file);
console.log(`Folder   : public/${DIR_NAME}`);
console.log(`Images   : ${files.length}${files.length !== byStem.size ? `  (${files.length - byStem.size} duplicate stems ignored)` : ''}`);

await mongoose.connect(URI);
const rowsCol = mongoose.connection.db.collection('barcodeLabel');

/* --------------------------------------------------------------- matching -- */

const stems = [...byStem.keys()];
const candidates = await rowsCol.find({
  $or: [{ barcodeGenerated: { $in: stems } }, { oldBarcode: { $in: stems } }],
}).toArray();

const fileFor = (r) => byStem.get(up(r.barcodeGenerated)) || byStem.get(up(r.oldBarcode)) || null;
const urlFor = (file) => `/${DIR_NAME}/${file}`;

/* An S3/Spaces presigned URL states its own lifetime. Returns the moment it
   stopped being valid, or null if this is not a presigned URL at all. */
function expiredAt(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const date = u.searchParams.get('X-Amz-Date');
  const expires = u.searchParams.get('X-Amz-Expires');
  if (!date || !expires || !u.searchParams.get('X-Amz-Signature')) return null;
  const iso = date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
  const signed = new Date(iso);
  if (Number.isNaN(signed.getTime())) return null;
  const dead = new Date(signed.getTime() + Number(expires) * 1000);
  return dead < new Date() ? dead : null;
}

const toFill = [];
const toReplace = [];
const alreadyHave = [];
for (const r of candidates) {
  const file = fileFor(r);
  if (!file) continue;
  const stored = String(r.imageUrl || '').trim();
  if (!stored) { toFill.push({ r, url: urlFor(file) }); continue; }
  const dead = KEEP_EXPIRED ? null : expiredAt(stored);
  if (dead) { toReplace.push({ r, url: urlFor(file), stored, dead }); continue; }
  alreadyHave.push({ r, stored });
}

const usedStems = new Set(candidates.map((r) => (byStem.has(up(r.barcodeGenerated)) ? up(r.barcodeGenerated) : up(r.oldBarcode))));
const unused = stems.filter((s) => !usedStems.has(s));

console.log(`Barcodes : ${usedStems.size} of ${byStem.size} images match at least one barcode row`);
console.log(`Rows     : ${candidates.length} rows carry one of those barcodes`);
console.log(`  to fill (image currently empty)  : ${toFill.length}`);
console.log(`  to replace (link already expired): ${toReplace.length}`);
console.log(`  left alone (photo still good)    : ${alreadyHave.length}`);

if (toReplace.length) {
  console.log('\n--- EXPIRED PRESIGNED LINKS TO BE REPLACED BY THE FILE ON DISK ---');
  toReplace.slice(0, 6).forEach(({ r, stored, dead }) =>
    console.log(`  ${String(r.barcodeGenerated || r.oldBarcode).padEnd(10)} expired ${dead.toISOString()}  ${stored.slice(0, 60)}...`));
  if (toReplace.length > 6) console.log(`  ... and ${toReplace.length - 6} more`);
}

if (alreadyHave.length) {
  console.log('\n--- LEFT ALONE, the stored photo still works ---');
  alreadyHave.slice(0, 6).forEach(({ r, stored }) =>
    console.log(`  ${String(r.barcodeGenerated || r.oldBarcode).padEnd(10)} ${stored.slice(0, 70)}${stored.length > 70 ? '...' : ''}`));
  if (alreadyHave.length > 6) console.log(`  ... and ${alreadyHave.length - 6} more`);
}

if (unused.length) {
  console.log(`\n--- ${unused.length} IMAGE(S) WITH NO BARCODE ROW (nothing to attach them to) ---`);
  console.log('  ' + unused.slice(0, 20).join(', ') + (unused.length > 20 ? ` ... +${unused.length - 20}` : ''));
}

const writes = [...toFill, ...toReplace];
if (!writes.length) {
  console.log('\nEvery matching row already has a working image. Nothing to do.');
  await mongoose.disconnect();
  process.exit(0);
}

/* one row per barcode in the sample - the same barcode occurs on several rows
   (one per GRC it passed through) and listing all of them says nothing new */
const seen = new Set();
const sample = writes.filter(({ r }) => {
  const k = up(r.barcodeGenerated) || up(r.oldBarcode);
  if (seen.has(k)) return false; seen.add(k); return true;
});
console.log('\n--- WOULD WRITE (one row shown per barcode) ---');
sample.slice(0, 10).forEach(({ r, url, stored }) =>
  console.log(`  ${String(r.barcodeGenerated || r.oldBarcode).padEnd(10)} ${stored ? 'replace expired' : 'fill empty     '} -> ${url}`));
if (sample.length > 10) console.log(`  ... ${sample.length} distinct barcodes in total`);

if (!APPLY) {
  console.log(`\nDRY RUN - ${writes.length} row(s) across ${sample.length} barcode(s) would get an imageUrl.`);
  console.log('Re-run with --apply to write.');
  await mongoose.disconnect();
  process.exit(0);
}

/* ------------------------------------------------------------------ apply -- */

const dir = path.join(ROOT, 'backups');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `barcode-images-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(writes.map(({ r, url }) => ({
  _id: r._id, barcodeGenerated: r.barcodeGenerated, oldBarcode: r.oldBarcode,
  imageUrl: r.imageUrl ?? null, filePath: r.filePath ?? null, willBeSetTo: url,
})), null, 2));
console.log(`\nBackup written: ${file}`);
console.log('  (every previous imageUrl is in there verbatim - restoring is a $set back from this file)');

const result = await rowsCol.bulkWrite(writes.map(({ r, url }) => ({
  updateOne: { filter: { _id: r._id }, update: { $set: { imageUrl: url } } },
})), { ordered: false });
console.log(`imageUrl set on ${result.modifiedCount} row(s) (matched ${result.matchedCount})`);
console.log(`  filled empty: ${toFill.length}   replaced expired: ${toReplace.length}`);

const left = await rowsCol.countDocuments({
  $or: [{ barcodeGenerated: { $in: stems } }, { oldBarcode: { $in: stems } }],
  $and: [{ $or: [{ imageUrl: '' }, { imageUrl: null }, { imageUrl: { $exists: false } }] }],
});
console.log(`Rows matching a shipped image that still have no imageUrl: ${left}`);

await mongoose.disconnect();
