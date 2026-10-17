/* ==========================================================================
   SEED newData.xlsx -> barcodeLabel (+ masters), one-time migration.

   The workbook is a stock export from the old ERP (sheet "MASTER JNR (2)"):
   one row per barcode per location. Each row with stock on hand becomes a
   barcodeLabel unit IN_STOCK at its location, with a GRC_IN row in the stock
   ledger - so every report sees it exactly like GRC stock.

     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/seedBarcodesFromNewData.mjs [--limit=10] [--apply]

     (default)        DRY RUN - reads, resolves, prints what WOULD happen.
                      Nothing is written.
     --apply          writes.
     --limit=N        first N data rows of the sheet (default 10; --limit=0 = all).
     --file=X.xlsx    default newData.xlsx (project root).
     --finYear=YYYY-YYYY  default the current April-March year.
     --include-zero   also store Close Qty 0 rows, with status SOLD.

   RULES (agreed 16-10-2026):
     - Business is not in the sheet: the row's "Location Name" is matched to
       a companylocation (case-insensitive) among businesses that still exist;
       the location's business is the business. 0 or >1 match -> error row.
     - Excel "Item Code" IS the barcode number -> barcodeNo (+ oldBarcode, so
       the sticker already on the goods scans). Excel "Item Name" is the item
       code (item master).
     - Close Qty 0 -> skipped. Only stock on hand is seeded.
     - A barcode already at that business + location -> skipped and reported;
       nothing existing is ever changed. The same barcode at another location
       is allowed (inter-company / transfers do that) - one row per location.
     - Masters are found first and created only when missing, all inside the
       row's business: Supplier (by G-code), Group (top level - Sub Group is
       NOT used), HSN, Item. Business / location / tax / uom are never created.

   Safe to re-run: a seeded row is found by the "already at this location"
   check next time. Every row written is tagged source:'NEWDATA_EXCEL' and
   importedFrom {file,row}; ledger rows carry refModel 'NEWDATA_EXCEL'.

   A CSV report of every row goes to scripts/reports/.
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { MOVEMENT_TYPES } from '@/models/StockMovement';
import { applyMovement, withTransaction } from '@/lib/inventory';
import { encodeRate } from '@/lib/purchaseRateCode';
import { uomTypeOf } from '@/lib/barcodeUnits';
import { contactCollection } from '@/lib/contactStorage';

const SOURCE = 'NEWDATA_EXCEL';

/* ------------------------------------------------------------ arguments -- */
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const APPLY = process.argv.includes('--apply');
/* --include-zero: Close Qty 0 rows are stored too (user, 16-10-2026 - they
   were sold or sent on at the old ERP), with status SOLD: kept with all
   their details for look-up, at the location they were last at, never in
   stock or counted, and with no ledger row since no stock came in here. */
const INCLUDE_ZERO = process.argv.includes('--include-zero');
const LIMIT = Number(arg('limit', '10'));
const FILE = arg('file', 'newData.xlsx');
const FIN_YEAR = arg('finYear', (() => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-' + (y + 1);
})());

/* -------------------------------------------------------------- helpers -- */
const { ObjectId } = mongoose.Types;
const txt = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
/* a price as the barcode stores it - plain text, '' when blank */
const money = (v) => (txt(v) === '' ? '' : String(num(v)));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ci = (s) => new RegExp('^' + esc(txt(s)) + '$', 'i');
const norm = (s) => txt(s).toLowerCase().replace(/\s+/g, ' ');

/* "supplier description: KHANN KADR | P-M-F: FAUX" -> { supplierDescription, pmf } */
function parseAttributes(v) {
  const out = { supplierDescription: '', pmf: '' };
  txt(v).split('|').forEach((part) => {
    const m = part.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m) return;
    const key = m[1].trim().toLowerCase();
    if (key === 'supplier description') out.supplierDescription = m[2].trim();
    else if (key === 'p-m-f') out.pmf = m[2].trim();
  });
  return out;
}

/* "MILLENNIUM Textiles, SURAT" -> "SURAT" */
const cityOf = (name) => (txt(name).includes(',') ? txt(name).split(',').pop().trim() : '');

/* ----------------------------------------------------------------- main -- */
async function main() {
  const file = path.resolve(process.cwd(), FILE);
  if (!fs.existsSync(file)) throw new Error('File not found: ' + file);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set - run with --env-file=.env');

  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all;

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - ${path.basename(file)} sheet "${wb.SheetNames[0]}" - ${rows.length} of ${all.length} rows - finYear ${FIN_YEAR}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const supplierColl = db.collection(contactCollection('Supplier'));

  /* ---- locations of businesses that still exist ---- */
  const businesses = await db.collection('business').find({}, { projection: { name: 1 } }).toArray();
  const bizName = new Map(businesses.map((b) => [String(b._id), b.name]));
  const locations = (await db.collection('companylocation').find({}, { projection: { name: 1, businessId: 1 } }).toArray())
    .filter((l) => bizName.has(String(l.businessId)));

  /* ---- caches: one lookup / one create per master per run ---- */
  const cache = new Map();
  const cached = async (key, fn) => {
    if (!cache.has(key)) cache.set(key, await fn());
    return cache.get(key);
  };
  const created = { supplier: [], group: [], hsn: [], item: [] };
  /* in a dry run nothing is inserted, so a created master is a placeholder id */
  const insert = async (coll, doc) => {
    if (!APPLY) return { ...doc, _id: new ObjectId(), __dry: true };
    const now = new Date();
    const full = { ...doc, createdAt: now, updatedAt: now, __v: 0 };
    const res = await db.collection(coll).insertOne(full);
    return { ...full, _id: res.insertedId };
  };

  const supplierFor = (biz, code, name) => cached(`sup|${biz}|${norm(code)}|${norm(name)}`, async () => {
    if (!txt(code) && !txt(name)) return null;
    const found = (txt(code) && await supplierColl.findOne({ contactKind: 'Supplier', businessId: biz, contactId: ci(code) }))
      || (txt(name) && await supplierColl.findOne({ contactKind: 'Supplier', businessId: biz, businessName: ci(name) }));
    if (found) return found;
    /* the business's "Vendor for Goods" type (prefix G), else any supplier type */
    const type = await db.collection('contacttype').findOne({ businessId: biz, contactType: 'Supplier', prefix: /^g$/i })
      || await db.collection('contacttype').findOne({ businessId: biz, contactType: 'Supplier' });
    const doc = await insert(contactCollection('Supplier'), {
      businessId: biz,
      typeId: type?._id || null,
      contactKind: 'Supplier',
      contactId: txt(code).toUpperCase(),
      businessName: txt(name),
      contactType2: 'Individual',
      prefix: 'Mr.',
      firstName: '', middleName: '', lastName: '',
      billingCity: cityOf(name),
      billingCountry: 'India',
      gstNo: '',
      sameAsBilling: false,
      markupPriceCalculation: 'Purchase Rate',
      priceList: 'ON RSP',
      openingBalance: 0,
    });
    created.supplier.push(`${txt(code)} ${txt(name)}`);
    return doc;
  });

  const groupFor = (biz, name) => cached(`grp|${biz}|${norm(name)}`, async () => {
    if (!txt(name)) return null;
    const found = await db.collection('productgroup').findOne({ businessId: biz, name: ci(name), parentId: null });
    if (found) return found;
    const doc = await insert('productgroup', { businessId: biz, name: txt(name), prefix: '', parentId: null });
    created.group.push(txt(name));
    return doc;
  });

  const taxFor = (biz, gst) => cached(`tax|${biz}|${gst}`, async () => {
    const list = await db.collection('tax').find({ businessId: biz, igst: num(gst) }).toArray();
    /* "GST 5%" before "IGST 5%" - a counter sale is intra-state */
    return list.find((t) => /^gst/i.test(txt(t.taxName))) || list[0] || null;
  });

  const hsnFor = (biz, code, gst) => cached(`hsn|${biz}|${txt(code)}`, async () => {
    if (!txt(code)) return null;
    const found = await db.collection('hsn').findOne({ businessId: biz, code: txt(code) });
    if (found) return found;
    const tax = await taxFor(biz, gst);
    const doc = await insert('hsn', {
      businessId: biz,
      code: txt(code),
      status: 'Active',
      effectiveDate: new Date(),
      description: '',
      taxSlabs: tax ? [{ gstTaxNameId: tax._id, amountFrom: 0, amountTo: 0 }] : [],
    });
    created.hsn.push(txt(code) + (tax ? ` (${tax.taxName})` : ' (no tax slab)'));
    return doc;
  });

  const uomFor = (biz, uom) => cached(`uom|${biz}|${norm(uom)}`, async () => (txt(uom)
    ? db.collection('uom').findOne({ businessId: biz, $or: [{ shortName: ci(uom) }, { name: ci(uom) }] })
    : null));

  const itemFor = (biz, code, ctx) => cached(`item|${biz}|${norm(code)}`, async () => {
    if (!txt(code)) return null;
    const found = await db.collection('item').findOne({ businessId: biz, $or: [{ name: ci(code) }, { itemCode: ci(code) }] });
    if (found) return found;
    const uom = await uomFor(biz, ctx.uom);
    const doc = await insert('item', {
      businessId: biz,
      name: txt(code),
      itemCode: txt(code),
      ecommItemCode: '',
      subGroupId: ctx.group?._id || null,
      uomId: uom?._id || null,
      hsnId: ctx.hsn?._id || null,
      filterId: null,
      uniqueBarcode: 'No',
      offerPriceNetPrice: 'No',
      prefix: '',
      rsp: null, wsp: null, rspOfferPercent: null,
      image: '', description: '', attributeAddonIds: [], itemType: 'Simple',
    });
    created.item.push(txt(code));
    return doc;
  });

  const rateMapping = (biz, loc) => cached(`prc|${biz}|${loc}`, async () => {
    const doc = await db.collection('purchaseratecode').findOne({ businessId: biz, locationId: loc });
    return doc && doc.isActive !== false ? doc.digitMappings : null;
  });

  /* ---- each row ---- */
  const report = [];
  const toWrite = [];
  const seenHere = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const excelRow = i + 2; // header is row 1
    const barcode = txt(r['Item Code']);
    const locName = txt(r['Location Name']);
    const qty = num(r['Close Qty']);
    const line = { row: excelRow, barcode, location: locName, qty, action: '', note: '', masters: '' };
    report.push(line);

    if (!barcode) { line.action = 'error'; line.note = 'no barcode (Item Code) on the row'; continue; }
    const history = qty <= 0;
    if (history && !INCLUDE_ZERO) { line.action = 'skipped-qty0'; line.note = 'Close Qty is 0'; continue; }

    const locs = locations.filter((l) => norm(l.name) === norm(locName));
    if (locs.length !== 1) {
      line.action = 'error';
      line.note = locs.length ? `location "${locName}" is in ${locs.length} businesses` : `location "${locName}" not found`;
      continue;
    }
    const loc = locs[0];
    const biz = loc.businessId;
    line.location = `${loc.name} (${bizName.get(String(biz))})`;

    /* already at this business + location (by any of its spellings) */
    const key = `${String(biz)}|${String(loc._id)}|${barcode.toUpperCase()}`;
    const existing = await db.collection('barcodeLabel').findOne({
      businessId: String(biz),
      $and: [
        { $or: [{ barcodeNo: ci(barcode) }, { barcodeGenerated: ci(barcode) }, { oldBarcode: ci(barcode) }] },
        { $or: [{ currentLocationId: loc._id }, { locationId: String(loc._id) }] },
      ],
    }, { projection: { barcodeNo: 1, status: 1, qtyNum: 1 } });
    if (existing || seenHere.has(key)) {
      line.action = 'skipped-exists';
      line.note = existing ? `already in DB (${existing.status}, qty ${existing.qtyNum})` : 'twice in the sheet for this location';
      continue;
    }
    seenHere.add(key);

    /* masters */
    const before = { s: created.supplier.length, g: created.group.length, h: created.hsn.length, i: created.item.length };
    const supplier = await supplierFor(biz, r['Supplier Code'], r['Supplier Name']);
    const group = await groupFor(biz, r['Group Name']);
    const hsn = await hsnFor(biz, r['HSN'], r['GST %']);
    const item = await itemFor(biz, r['Item Name'], { group, hsn, uom: r['UOM'] });
    const made = [
      created.supplier.length > before.s && 'supplier',
      created.group.length > before.g && 'group',
      created.hsn.length > before.h && 'hsn',
      created.item.length > before.i && 'item',
    ].filter(Boolean);
    line.masters = made.length ? 'created: ' + made.join(', ') : 'all existing';

    /* the unit - same field shapes as lib/barcodeReportImport.js reportUnitDoc */
    const attrs = parseAttributes(r['Item Attributes']);
    const uom = txt(r['UOM']);
    const typed = txt(r['Batch/Unique']).toLowerCase();
    const batchType = typed === 'batch' || typed === 'unique' ? typed : (qty > 1 ? 'batch' : 'unique');
    const purRate = money(r['JNR Purchase Rate']);
    const printDescription = txt(r['Print Description']);

    toWrite.push({
      line,
      doc: {
        grcId: '',
        grcNo: txt(r['GRC No']),
        supplierId: supplier ? String(supplier._id) : '',
        groupId: group ? String(group._id) : '',
        barcodeNo: barcode,
        oldBarcode: barcode,
        barcodeGenerated: '',
        itemCode: txt(r['Item Name']),
        itemId: item?._id || null,
        itemName: item?.name || txt(r['Item Name']),
        printDescription,
        supplierDescription: attrs.supplierDescription,
        p_m_f: attrs.pmf,
        designNo: attrs.supplierDescription || printDescription,
        qty: String(Math.max(0, qty)),
        qtyNum: Math.max(0, qty),
        uom,
        uomType: uomTypeOf(uom),
        hsn: txt(r['HSN']),
        gst: money(r['GST %']),
        purRate,
        encodedPurRate: encodeRate(purRate, await rateMapping(biz, loc._id)),
        disc: money(r['Discount']),
        finalNet: money(r['Final Net Rate']),
        retailPrice: money(r['RSP']),
        offerPrice: money(r['RSP Offer Price']),
        wspPrice: money(r['WSP']),
        dpPrice: money(r['DP']),
        batchType,
        batchUnique: batchType,
        batchNo: batchType === 'batch' ? barcode : '',
        businessId: String(biz),
        locationId: String(loc._id),
        finYear: FIN_YEAR,
        /* a zero-stock row is SOLD (user, 16-10-2026), left at the location
           it was last at - the same shape a POS-sold unit has */
        status: history ? BARCODE_STATUS.SOLD : BARCODE_STATUS.IN_STOCK,
        currentLocationId: loc._id,
        currentBusinessId: biz,
        source: SOURCE,
        importedFrom: { file: path.basename(file), row: excelRow, sheet: wb.SheetNames[0] },
      },
    });
    line.action = (APPLY ? 'seeded' : 'would-seed') + (history ? '-sold' : '');
    if (history) line.note = 'Close Qty 0 - stored as SOLD (not in stock)';
  }

  /* ---- write: units + their GRC_IN ledger rows, one transaction per row ---- */
  if (APPLY) {
    for (const { line, doc } of toWrite) {
      try {
        await withTransaction(async (session) => {
          const { importedFrom, ...unitDoc } = doc;
          const [unit] = await BarcodeLabel.insertMany([unitDoc], session ? { session, ordered: true } : { ordered: true });
          /* importedFrom is not on the schema (strict mode drops it) - set
             through the raw driver so every seeded row stays traceable */
          await BarcodeLabel.collection.updateOne({ _id: unit._id }, { $set: { importedFrom } }, session ? { session } : {});
          /* no stock came in for a SOLD (zero-stock) unit - no ledger row */
          if (doc.status === BARCODE_STATUS.SOLD) return;
          await applyMovement({
            units: [unit.toObject()],
            expect: null,
            set: { status: BARCODE_STATUS.IN_STOCK, currentLocationId: doc.currentLocationId, currentBusinessId: doc.currentBusinessId },
            movement: {
              type: MOVEMENT_TYPES.GRC_IN,
              direction: 'in',
              toLocationId: doc.currentLocationId,
              refModel: SOURCE,
              refNo: doc.grcNo || '',
              reason: 'Seeded from newData.xlsx (row ' + line.row + ')',
              finYear: FIN_YEAR,
            },
            session,
          });
        });
      } catch (err) {
        line.action = 'error';
        line.note = 'write failed: ' + err.message;
      }
    }
  }

  /* ---- report ---- */
  console.table(report.map(({ row, barcode, location, qty, action, masters, note }) => ({ row, barcode, location, qty, action, masters, note })));
  const count = (a) => report.filter((x) => x.action === a).length;
  const verb = APPLY ? 'seeded' : 'would-seed';
  console.log(`\n${APPLY ? 'seeded' : 'would seed'} in stock: ${count(verb)}   as SOLD (qty 0): ${count(verb + '-sold')}   skipped (qty 0): ${count('skipped-qty0')}   skipped (exists): ${count('skipped-exists')}   errors: ${count('error')}`);
  ['supplier', 'group', 'hsn', 'item'].forEach((k) => {
    if (created[k].length) console.log(`${APPLY ? 'created' : 'would create'} ${k}: ${created[k].join(' | ')}`);
  });

  const dir = path.resolve(process.cwd(), 'scripts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `newdata-seed-${APPLY ? 'apply' : 'dryrun'}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  fs.writeFileSync(out, ['row,barcode,location,qty,action,masters,note',
    ...report.map((x) => [x.row, x.barcode, x.location, x.qty, x.action, x.masters, x.note].map(csv).join(','))].join('\n'));
  console.log('report: ' + path.relative(process.cwd(), out));
  if (!APPLY) console.log('\n*** DRY RUN - nothing written. Re-run with --apply to write. ***');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
