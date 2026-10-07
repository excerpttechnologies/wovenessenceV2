/* Seed the Barcode Item list from "dump db for grow (2).xlsx".

   Usage, from the project root:
     node scripts/seedBarcodeDump.mjs            dry run - reports, writes nothing
     node scripts/seedBarcodeDump.mjs --apply    actually inserts

   WHAT IT WRITES
   Only the fields the Barcode Item screen needs, per
   app/api/inventory-barcode-list/route.js:

     businessId / locationId   scoping - the list filters on these
     itemCode                  the Items filter, and the Item column fallback
     printDescription          the "Item" column
     retailPrice               the "RSP" column and the RSP filter
     finalNet                  the "CP" column and the CP filter
     groupId                   the Group Name filter (a real ProductGroup id)
     imageUrl                  the "Image" column
     createdAt / updatedAt     taken from the sheet's own _scraped_at

   CP goes in finalNet, not purRate. The source system's Barcode Report shows
   CP as "Final Rate" (item 160946: Purchase Rate 1479.25, Final Rate 1525.00,
   and the sheet's CP is 1525), and the screen's CP filter queries finalNet.

   WHAT IT DELIBERATELY DOES NOT WRITE
   barcodeGenerated, oldBarcode, grcId, supplierId, qty, hsn, purRate, disc,
   gst, wspPrice, dpPrice, offerPrice, subgroup. None of those have a source in
   the sheet, or are unused by this screen. "Barcode No" and "GRC No" will
   therefore be blank - intended, not a defect.

   SAFETY
   Insert-only; nothing existing is updated or deleted. Every pre-existing row
   came from barcode generation and carries grcId, so this aborts if it finds
   rows without one - that means the import already ran.                     */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const XLSX = 'dump db for grow (2).xlsx';

/* Branch -> business + location.

   The sheet's `branch` column holds BUSINESS names only; there is no location
   column. TEMPLE FABRICS, SILKS & SAREES and SUVARNA FABRICS have exactly one
   location each, so those are forced. Temple Fabrics has three, and Warehouse
   was confirmed against the source system's Barcode Report: item codes 160946,
   248865, 251358, 165704 and 114466 all resolved to "Temple Fabrics Warehouse"
   when searched across All Locations.                                       */
const MAP = {
  'TEMPLE FABRICS, SILKS & SAREES': { biz: '6a853ba0fb266c4358beb530', loc: '6a874b62b5810c74e6a9b9c4' },
  'SUVARNA FABRICS':                { biz: '6a853bf6fb266c4358beb538', loc: '6a8c28fbc67379ce90586e44' },
  'Temple Fabrics':                 { biz: '6a853cdefb266c4358beb548', loc: '6a858ded9d37d436b1fc02dc' },
};

/* column indexes in the sheet */
const C = {
  group: 3, itemCode: 5, rsp: 9, cp: 10,
  itemName: 12, scrapedAt: 16, branch: 17, imageUrl: 19,
};

/* ---------------------------------------------------------------- env ---- */
/* the same hand-rolled reader scripts/seed.mjs uses, so no dotenv dependency */
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  }
}

/* --------------------------------------------------------------- xlsx ---- */
/* An .xlsx is a zip of XML. This reads the central directory rather than
   scanning for local headers, because entries written with a data descriptor
   carry zero sizes in their local header. */
function unzip(file) {
  const buf = fs.readFileSync(file);

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive: ' + file);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    /* the local header repeats the name/extra lengths and they can differ */
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);

    p += 46 + nameLen + extraLen + commLen;
  }
  return out;
}

const unesc = (str) => str
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, String.fromCharCode(39))
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

function readSheet(files) {
  const shared = [];
  const ssXml = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : '';
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const run of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += run[1];
    shared.push(unesc(t));
  }

  const sheet = files['xl/worksheets/sheet1.xml'].toString('utf8');
  const colIdx = (ref) => {
    let n = 0;
    for (const ch of ref.match(/^([A-Z]+)/)[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const type = (cm[2].match(/t="([^"]+)"/) || [])[1] || 'n';
      let val = '';
      if (type === 's') {
        const v = (cm[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = v === undefined ? '' : (shared[Number(v)] ?? '');
      } else if (type === 'inlineStr') {
        for (const run of cm[3].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) val += run[1];
        val = unesc(val);
      } else {
        const v = (cm[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = v === undefined ? '' : unesc(v);
      }
      cells[colIdx(cm[1])] = val;
    }
    rows.push(cells);
  }
  return rows;
}

/* --------------------------------------------------------------- main ---- */
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

async function main() {
  loadEnv();

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to .env.');
    process.exit(1);
  }
  if (!fs.existsSync(XLSX)) {
    console.error('Cannot find "' + XLSX + '" in ' + path.resolve('.'));
    process.exit(1);
  }

  const rows = readSheet(unzip(XLSX)).slice(1);
  console.log('read ' + rows.length + ' data rows from ' + XLSX + '\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const col = db.collection('barcodeLabel');

  const already = await col.countDocuments({ grcId: { $exists: false } });
  if (already > 0) {
    console.error('ABORT: ' + already + ' rows already have no grcId - this import has run before.');
    console.error('Delete those rows first if you mean to re-import.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('pre-flight: ' + (await col.countDocuments()) + ' existing rows, all with grcId. Safe to add.\n');

  const groupId = {};
  for (const g of await db.collection('productgroup').find({}).toArray()) {
    const k = String(g.businessId) + '|' + s(g.name).toUpperCase();
    if (!groupId[k]) groupId[k] = String(g._id);
  }

  const docs = [];
  const perBranch = {};
  let noGroup = 0;
  let noImage = 0;

  for (const r of rows) {
    const branch = s(r[C.branch]);
    const m = MAP[branch];
    if (!m) {
      console.error('unmapped branch in sheet: "' + branch + '"');
      await mongoose.disconnect();
      process.exit(1);
    }

    const when = new Date(s(r[C.scrapedAt]) || Date.now());
    const gid = groupId[m.biz + '|' + s(r[C.group]).toUpperCase()];
    const img = s(r[C.imageUrl]);
    if (!gid) noGroup++;
    if (!img) noImage++;

    const doc = {
      businessId: m.biz,
      locationId: m.loc,
      itemCode: s(r[C.itemCode]),
      printDescription: s(r[C.itemName]),
      retailPrice: s(r[C.rsp]),
      finalNet: s(r[C.cp]),
      createdAt: when,
      updatedAt: when,
    };
    /* written only when the sheet actually supplies one */
    if (gid) doc.groupId = gid;
    if (img) doc.imageUrl = img;

    docs.push(doc);
    perBranch[branch] = (perBranch[branch] || 0) + 1;
  }

  console.log('built ' + docs.length + ' documents');
  for (const [b, n] of Object.entries(perBranch)) console.log('   ' + b.padEnd(34) + n);
  console.log('\nrows with no matching ProductGroup : ' + noGroup);
  console.log('rows with no image_url             : ' + noImage);
  console.log('\nSAMPLE\n' + JSON.stringify(docs[0], null, 2));

  if (!APPLY) {
    console.log('\n*** DRY RUN - nothing written. Re-run with --apply to insert. ***');
    await mongoose.disconnect();
    return;
  }

  console.log('\ninserting...');
  let done = 0;
  for (let i = 0; i < docs.length; i += 1000) {
    const batch = docs.slice(i, i + 1000);
    await col.insertMany(batch, { ordered: false });
    done += batch.length;
    process.stdout.write('  ' + done + ' / ' + docs.length + '\r');
  }

  console.log('\n\ninserted ' + done);
  console.log('barcodeLabel total now : ' + (await col.countDocuments()));
  for (const [b, m] of Object.entries(MAP)) {
    const n = await col.countDocuments({
      businessId: m.biz, locationId: m.loc, grcId: { $exists: false },
    });
    console.log('   ' + b.padEnd(34) + n);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
