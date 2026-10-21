/* ==============================================================================
   SEED HSR OPENING STOCK 19-10-2026 (FAST VERSION + LOCATION TRANSFER)

   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/seedHsrOpening.mjs [options]

   Flags:
     --apply              Actually write to database (default is DRY RUN)
     --limit=N            Process first N rows (default 10; --limit=0 = all)
     --transfer-hsr       Transfer locationId to HSR after seeding (requires --apply)
     --finYear=YYYY-YYYY  Override financial year
     --chunk=N            Barcodes per transaction (default 500)
     --include-zero       Include zero-qty records as SOLD status

     --sync               Do not seed. Compare every existing HSR_OPENING_19_10
                          barcode with the workbook and update all
                          source-controlled fields (date, age, quantities,
                          prices, supplier, group, item, HSN/GST, label text).
                          Barcode number, both location ids, business ids,
                          status, sales/billing/transfer links and images are
                          never touched. Dry run unless --apply is also given.
     Missing workbook rows are reported, never inserted by --sync: the
     workbook has no location column, and the two existing location sets were
     produced by a 50/50 split that cannot be reconstructed from the file.

   PHASE 1: Seeds barcodes at TEMPLE FABRICS WAREHOUSE
   PHASE 2: Optionally transfers locationId to HSR (TEMPLE FABRIC JNR)
            Use --transfer-hsr flag to enable

   Speed changes vs. original:
     - All masters (supplier/group/hsn/uom/item) preloaded into Maps
     - New masters queued and bulk-inserted
     - Barcodes inserted in chunks (insertMany + one applyMovement per chunk)
     - In-memory duplicate detection
============================================================================== */

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

const SOURCE = 'HSR_OPENING_19_10';
const FILE = 'hsr_opening_19_10_dated.xlsx';
const DEFAULT_LOCATION = 'TEMPLE FABRICS WAREHOUSE';
const HSR_LOCATION_ID = '6a858ded9d37d436b1fc02dc'; // TEMPLE FABRIC JNR - HSR target location

/* Arguments */
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const APPLY = process.argv.includes('--apply');
const INCLUDE_ZERO = process.argv.includes('--include-zero');
const TRANSFER_TO_HSR = process.argv.includes('--transfer-hsr'); // Transfer locationId to HSR after seeding
const SYNC = process.argv.includes('--sync');
const LIMIT = arg('limit', null) === null ? (SYNC ? 0 : 10) : Number(arg('limit', '10'));
const CHUNK = Number(arg('chunk', '500'));
const FIN_YEAR = arg('finYear', (() => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '-' + (y + 1);
})());

/* Helpers */
const { ObjectId } = mongoose.Types;
const txt = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => (txt(v) === '' ? '' : String(num(v)));
const norm = (s) => txt(s).toLowerCase().replace(/\s+/g, ' ');
const cityOf = (name) => (txt(name).includes(',') ? txt(name).split(',').pop().trim() : '');

const parseDate = (v) => {
  if (!v) return null;
  if (typeof v === 'number' && v > 1000) {
    const date = XLSX.SSF.parse_date_code(v);
    return new Date(date.y, date.m - 1, date.d);
  }
  const parsed = new Date(v);
  return isNaN(parsed) ? null : parsed;
};

const calculateAge = (date) => {
  if (!date) return 0;
  return Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
};

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

function getColumnValue(row, variations) {
  for (const variant of variations) {
    if (row[variant] !== undefined) return row[variant];
  }
  return '';
}

/* ==============================================================================
   SYNC MODE - reconcile existing rows with the workbook, field by field
   ============================================================================== */

const BUSINESS_HSR = '6a853ba0fb266c4358beb530';
const BUSINESS_WAREHOUSE = '6a853cdefb266c4358beb548';
const LOCATION_HSR = '6a874b62b5810c74e6a9b9c4';
const LOCATION_WAREHOUSE = '6a858ded9d37d436b1fc02dc';

const SYNC_NUMERIC = new Set([
  'qty', 'qtyNum', 'openingQty', 'hsrPurPrice', 'gst', 'purRate', 'disc',
  'finalNet', 'retailPrice', 'offerPrice', 'wspPrice', 'dpPrice', 'stockAge',
]);

const SYNC_PROTECTED = [
  'barcodeNo', 'oldBarcode', 'barcodeGenerated', 'businessId', 'currentBusinessId',
  'locationId', 'currentLocationId', 'status', 'sales', 'billingId', 'transferId',
  'source', 'importedFrom', 'customFields', 'images', 'createdAt',
];

const isPlaceholderSupplier = (v) => {
  const t = txt(v);
  return !t || t === '0' || /^\(?unassigned\)?$/i.test(t);
};

const dayKey = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const parseWorkbookDate = (v) => {
  const t = txt(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (/^\d+(\.\d+)?$/.test(t)) {
    const d = XLSX.SSF.parse_date_code(Number(t));
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : null;
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const ageBetween = (from, to) => {
  if (!from || !to) return null;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86400000);
};

const sameValue = (field, a, b) => {
  if (field === 'stockDate') return dayKey(a) === dayKey(b);
  if (SYNC_NUMERIC.has(field)) return num(a) === num(b);
  return txt(a) === txt(b);
};

const workbookDateOf = (r) => parseWorkbookDate(getColumnValue(r, ['Date', 'Stock Date', 'As On Date']))
  || parseWorkbookDate(getColumnValue(r, ['Purchase Date']));

const lotMatches = (doc, candidate) => {
  if (!doc) return false;
  if (num(doc.qty) !== num(candidate.qty)) return false;
  const docDate = dayKey(doc.stockDate);
  const exDate = dayKey(workbookDateOf(candidate.r));
  if (docDate && exDate && docDate !== exDate) return false;
  const docGrc = txt(doc.grcNo);
  const exGrc = txt(getColumnValue(candidate.r, ['GRC No', 'GRC']));
  if (docGrc && exGrc && docGrc !== exGrc) return false;
  if (num(doc.hsrPurPrice) !== num(getColumnValue(candidate.r, ['hsr pur price', 'HSR Pur Price', 'HSR Purchase Price', 'Pur Price', 'Purchase Price']))) return false;
  if (num(doc.purRate) !== num(getColumnValue(candidate.r, ['hsr pur price', 'JNR Purchase Rate', 'Purchase Rate', 'PurRate']))) return false;
  return true;
};

function chooseWorkbookRow(list, doc) {
  const positive = list.filter((x) => x.qty > 0);
  const nonPositive = list.filter((x) => x.qty <= 0);
  const duplicateRows = list.length > 1;
  /* A SOLD record represents the qty-0 lot; an IN_STOCK record represents the
     qty>0 lot. Only fall back to the other side when that side has no rows. */
  const pool = doc && doc.status === BARCODE_STATUS.SOLD
    ? (nonPositive.length ? nonPositive : list)
    : (positive.length ? positive : list);
  const multiPositive = positive.length > 1 && (!doc || doc.status !== BARCODE_STATUS.SOLD);

  if (doc) {
    const exact = pool.find((x) => lotMatches(doc, x));
    if (exact) {
      return { chosen: exact, multiPositive, duplicateRows, ambiguous: false };
    }
    /* No workbook row describes the current lot tuple. With one candidate
       there is nothing to be ambiguous about; with several (all qty 0, or
       several in-stock lots) we must not guess which lot the barcode means. */
    if (pool.length > 1) {
      return { chosen: pool[pool.length - 1], multiPositive, duplicateRows, ambiguous: true };
    }
    if (pool.length === 1) {
      return { chosen: pool[0], multiPositive, duplicateRows, ambiguous: false };
    }
  }

  return {
    chosen: positive.length ? positive[0] : list[list.length - 1],
    multiPositive,
    duplicateRows,
    ambiguous: false,
  };
}

function buildSyncDesired(doc, chosen, ctx, skipLot) {
  const r = chosen.r;
  const biz = String(doc.businessId);
  const notes = [];

  const exCode = txt(getColumnValue(r, ['Supplier Code', 'SupplierCode']));
  const exName = txt(getColumnValue(r, ['Supplier Name', 'Supplier']));
  let supplierId = txt(doc.supplierId);
  const currentSupplier = ctx.supById.get(supplierId);
  /* The masters can contain more than one record for the same code (G1300 is
     duplicated). If the record already points at a supplier with the
     workbook's code or name, keep that exact id - switching between equal
     masters is churn, and the barcode's supplier is already correct. */
  const supplierMatches = currentSupplier && (
    (txt(exCode) && norm(currentSupplier.contactId) === norm(exCode))
    || (txt(exName) && norm(currentSupplier.businessName) === norm(exName))
  );

  if (supplierMatches) {
    supplierId = String(currentSupplier._id);
  } else if (!isPlaceholderSupplier(exCode) || !isPlaceholderSupplier(exName)) {
    const sup = ctx.supByBiz.get(`${biz}|${norm(exCode)}`)
      || ctx.supByBiz.get(`${biz}|${norm(exName)}`)
      || ctx.supByCode.get(norm(exCode))
      || ctx.supByName.get(norm(exName));
    if (sup) {
      supplierId = String(sup._id);
      if (txt(sup.businessId) && txt(doc.businessId) && String(sup.businessId) !== String(doc.businessId)) {
        notes.push('supplier belongs to another business');
      }
    } else {
      notes.push(`supplier not found (${exCode || exName})`);
    }
  } else if (!currentSupplier) {
    const unassigned = ctx.supByBiz.get(`${biz}|g741`) || ctx.supByCode.get('g741');
    if (unassigned) supplierId = String(unassigned._id);
    else notes.push('no unassigned supplier in this business');
  }

  const groupName = txt(getColumnValue(r, ['Group Name', 'Group']));
  let groupId = txt(doc.groupId);
  const currentGroup = ctx.grpById.get(groupId);
  if (currentGroup && norm(currentGroup.name) === norm(groupName)) {
    /* Product masters can contain two groups with the same name (INSKIRT is
       duplicated). Name equality is the whole relationship; keep the id the
       barcode already uses instead of switching to the other twin. */
    groupId = String(currentGroup._id);
  } else {
    const group = ctx.grpByBiz.get(`${biz}|${norm(groupName)}`) || ctx.grpByName.get(norm(groupName));
    if (group) groupId = String(group._id);
    else if (groupName) notes.push(`group not found (${groupName})`);
  }

  const exItemName = txt(getColumnValue(r, ['Item Name', 'Item', 'ItemName']));
  const exItemCode = txt(getColumnValue(r, ['Item Code_1', 'Item Code 1'])) || txt(getColumnValue(r, ['Item Code']));
  let item = ctx.itemById.get(txt(doc.itemId));
  const itemMatches = item && (
    norm(item.name) === norm(exItemName)
    || norm(item.itemCode) === norm(exItemName)
    || norm(item.name) === norm(exItemCode)
    || norm(item.itemCode) === norm(exItemCode)
  );
  if (!itemMatches) {
    item = ctx.itemByBiz.get(`${biz}|${norm(exItemName)}`)
      || ctx.itemByBiz.get(`${biz}|${norm(exItemCode)}`)
      || ctx.itemByName.get(norm(exItemName))
      || ctx.itemByCode.get(norm(exItemCode))
      || item;
  }
  if (!item) notes.push(`item not found (${exItemName || exItemCode})`);

  const attrs = parseAttributes(getColumnValue(r, ['Item Attributes', 'Attributes']));
  const printDescription = txt(getColumnValue(r, ['Print Description', 'Description']));
  const uom = txt(getColumnValue(r, ['UOM', 'Unit']));
  const hsn = txt(getColumnValue(r, ['HSN', 'HSN Code']));
  const gst = money(getColumnValue(r, ['GST %', 'GST']));
  const purRate = money(getColumnValue(r, ['hsr pur price', 'JNR Purchase Rate', 'Purchase Rate', 'PurRate']));
  const grcNo = txt(getColumnValue(r, ['GRC No', 'GRC']));
  const stockDate = parseWorkbookDate(getColumnValue(r, ['Date', 'Stock Date', 'As On Date']))
    || parseWorkbookDate(getColumnValue(r, ['Purchase Date']));
  const ageRaw = getColumnValue(r, ['Age', 'Stock Age']);
  const providedAge = txt(ageRaw) === '' ? null : num(ageRaw);
  const derivedAge = stockDate ? ageBetween(stockDate, ctx.referenceDate) : null;
  let stockAge = providedAge;
  let ageCorrectionNote = '';
  if (providedAge === null) {
    stockAge = derivedAge === null ? (doc.stockAge ?? null) : derivedAge;
  } else if (derivedAge !== null && Math.abs(providedAge - derivedAge) > 1) {
    /* The workbook's Age column is internally consistent for 20,538 of its
       20,548 rows (Date + Age = 19-10-2026). Ten rows carry Age 2366 against
       a 2026-09-29 date - impossible. Prefer the date, which the rest of the
       row corroborates, and report the correction. */
    ageCorrectionNote = `Age corrected ${providedAge} → ${derivedAge}`;
    stockAge = derivedAge;
  }
  const qty = chosen.qty;
  const typed = txt(getColumnValue(r, ['Batch/Unique', 'Type'])).toLowerCase();
  const batchType = typed === 'batch' || typed === 'unique' ? typed : (qty > 1 ? 'batch' : 'unique');
  const rateMapping = ctx.rateMappings.get(`${biz}|${txt(doc.locationId)}`) || null;
  const encodedPurRate = encodeRate(purRate, rateMapping);

  const desired = {
    supplierId,
    groupId,
    itemId: item ? item._id : doc.itemId,
    itemCode: txt(item?.itemCode) || txt(item?.name) || exItemName || txt(doc.itemCode),
    itemName: txt(item?.name) || exItemName || txt(doc.itemName),
    printDescription,
    supplierDescription: attrs.supplierDescription || txt(doc.supplierDescription),
    p_m_f: attrs.pmf || txt(doc.p_m_f),
    designNo: attrs.supplierDescription || printDescription || txt(doc.designNo),
    uom,
    uomType: uomTypeOf(uom),
    hsn,
    gst,
    purRate,
    disc: money(getColumnValue(r, ['Discount %', 'Discount', 'Disc'])),
    retailPrice: money(getColumnValue(r, ['RSP', 'Retail Price'])),
    offerPrice: money(getColumnValue(r, ['RSP Offer Price', 'Offer'])),
    wspPrice: money(getColumnValue(r, ['WSP'])),
    dpPrice: money(getColumnValue(r, ['DP'])),
    batchType,
    batchUnique: batchType,
    batchNo: batchType === 'batch' ? txt(doc.barcodeNo) : '',
    stockDate: stockDate || doc.stockDate || null,
    stockAge,
  };

  const finalNet = money(getColumnValue(r, ['Final Net Rate', 'Net Rate']));
  if (finalNet !== '') desired.finalNet = finalNet;
  if (encodedPurRate !== '') desired.encodedPurRate = encodedPurRate;

  if (skipLot) {
    notes.push('workbook rows for this barcode disagree or describe several lots - lot fields left untouched');
    for (const field of ['grcNo', 'purRate', 'encodedPurRate', 'disc', 'retailPrice', 'offerPrice',
      'wspPrice', 'dpPrice', 'batchType', 'batchUnique', 'batchNo', 'qty', 'qtyNum',
      'openingQty', 'hsrPurPrice', 'stockDate', 'stockAge', 'finalNet']) {
      delete desired[field];
    }
  } else {
    const q = Math.max(0, qty);
    desired.qty = String(q);
    desired.qtyNum = q;
    desired.openingQty = q;
    desired.hsrPurPrice = num(getColumnValue(r, ['hsr pur price', 'HSR Pur Price', 'HSR Purchase Price', 'Pur Price', 'Purchase Price']));
    if (grcNo) desired.grcNo = grcNo;
    else if (txt(doc.grcNo)) notes.push('GRC kept (workbook blank)');
  }

  if (!skipLot && ageCorrectionNote) notes.push(ageCorrectionNote);
  return { desired, notes };
}

async function runSync() {
  console.time('total');
  const file = path.resolve(process.cwd(), FILE);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set - run with --env-file=.env');

  console.log(`\n${'='.repeat(80)}`);
  console.log('HSR OPENING STOCK - FULL FIELD SYNC');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY (WRITE)' : '🟡 DRY RUN (READ ONLY)'}`);
  console.log(`File: ${FILE}`);
  console.log(`Limit: ${LIMIT === 0 ? 'ALL ROWS' : LIMIT + ' rows'}`);
  console.log('='.repeat(80) + '\n');

  const wb = XLSX.readFile(file);
  const sheetStats = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { raw: false, defval: '' }).length,
  }));
  const sheetName = wb.SheetNames[0];
  const all = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: '' });
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  if (!rows.length) throw new Error('No data rows found in Excel file');

  console.log('Worksheets:');
  sheetStats.forEach((s) => console.log(`   ${s.name}: ${s.rows} rows`));
  console.log(`Using sheet: ${sheetName} (${rows.length} rows)\n`);

  const qtyOf = (r) => num(getColumnValue(r, ['Open Qty', 'Close Qty', 'Quantity', 'Qty', 'Stock Qty']));
  const groups = new Map();
  let blankBarcode = 0;
  const asOfVotes = new Map();

  all.forEach((r, idx) => {
    const barcode = txt(getColumnValue(r, ['Item Code', 'Barcode', 'Barcode No', 'ItemCode'])).toUpperCase();
    const date = workbookDateOf(r);
    const ageRaw = txt(getColumnValue(r, ['Age', 'Stock Age']));
    if (date && ageRaw !== '') {
      const asOf = dayKey(new Date(date.getTime() + num(ageRaw) * 86400000));
      asOfVotes.set(asOf, (asOfVotes.get(asOf) || 0) + 1);
    }
    if (!barcode) { blankBarcode += 1; return; }
    if (!groups.has(barcode)) groups.set(barcode, []);
    groups.get(barcode).push({ r, row: idx + 2, qty: qtyOf(r) });
  });

  /* The Age column is as-of 19-10-2026 for the whole file; a handful of rows
     are wrong and vote for a different date. The most common Date + Age value
     is the workbook's real as-of date, not simply the latest Date in a row. */
  const [referenceKey = '', referenceVotes = 0] = [...asOfVotes.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const referenceDate = referenceKey ? new Date(`${referenceKey}T00:00:00.000Z`) : new Date();
  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  const duplicateRows = duplicateGroups.reduce((n, g) => n + g.length - 1, 0);

  console.log(`Excel: ${rows.length} rows, ${groups.size} unique barcodes`);
  console.log(`Duplicate barcode rows: ${duplicateRows} in ${duplicateGroups.length} groups`);
  console.log(`Blank barcode rows: ${blankBarcode}`);
  console.log(`Age reference date: ${referenceKey || '(none)'} (${referenceVotes} of ${all.length} rows)\n`);

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000,
  });
  const db = mongoose.connection.db;
  console.log('Connected to MongoDB\n');

  const supplierCollName = contactCollection('Supplier');
  const supplierQuery = supplierCollName === 'contact' ? { contactKind: 'Supplier' } : {};
  const [sups, grps, itms, sourceDocs, bizDocs, locDocs] = await Promise.all([
    db.collection(supplierCollName).find(supplierQuery).toArray(),
    db.collection('productgroup').find({}).toArray(),
    db.collection('item').find({}, { projection: { businessId: 1, name: 1, itemCode: 1 } }).toArray(),
    db.collection('barcodeLabel').find({ source: SOURCE }).toArray(),
    db.collection('business').find({}, { projection: { name: 1 } }).toArray(),
    db.collection('companylocation').find({}, { projection: { name: 1, businessId: 1 } }).toArray(),
  ]);

  const bizName = new Map(bizDocs.map((b) => [String(b._id), b.name]));
  const locName = new Map(locDocs.map((l) => [String(l._id), l.name]));

  const supById = new Map();
  const supByBiz = new Map();
  const supByCode = new Map();
  const supByName = new Map();
  sups.forEach((s) => {
    supById.set(String(s._id), s);
    if (txt(s.contactId)) supByBiz.set(`${String(s.businessId)}|${norm(s.contactId)}`, s);
    if (txt(s.businessName)) supByBiz.set(`${String(s.businessId)}|${norm(s.businessName)}`, s);
    if (txt(s.contactId) && !supByCode.has(norm(s.contactId))) supByCode.set(norm(s.contactId), s);
    if (txt(s.businessName) && !supByName.has(norm(s.businessName))) supByName.set(norm(s.businessName), s);
  });

  const grpById = new Map();
  const grpByBiz = new Map();
  const grpByName = new Map();
  grps.forEach((g) => {
    grpById.set(String(g._id), g);
    grpByBiz.set(`${String(g.businessId)}|${norm(g.name)}`, g);
    if (!grpByName.has(norm(g.name))) grpByName.set(norm(g.name), g);
  });

  const itemById = new Map();
  const itemByBiz = new Map();
  const itemByCode = new Map();
  const itemByName = new Map();
  itms.forEach((i) => {
    itemById.set(String(i._id), i);
    itemByBiz.set(`${String(i.businessId)}|${norm(i.name)}`, i);
    if (txt(i.itemCode)) itemByBiz.set(`${String(i.businessId)}|${norm(i.itemCode)}`, i);
    if (txt(i.itemCode) && !itemByCode.has(norm(i.itemCode))) itemByCode.set(norm(i.itemCode), i);
    if (txt(i.name) && !itemByName.has(norm(i.name))) itemByName.set(norm(i.name), i);
  });

  const rateMappings = new Map();
  const rateKeys = new Set(sourceDocs.map((d) => `${String(d.businessId)}|${txt(d.locationId)}`));
  for (const key of rateKeys) {
    const [biz, loc] = key.split('|');
    const doc = await db.collection('purchaseratecode').findOne({ businessId: biz, locationId: loc });
    rateMappings.set(key, doc && doc.isActive !== false ? doc.digitMappings : null);
  }

  const ctx = { supById, supByBiz, supByCode, supByName, grpById, grpByBiz, grpByName,
    itemById, itemByBiz, itemByCode, itemByName, rateMappings, referenceDate };

  const byBarcode = new Map();
  for (const doc of sourceDocs) {
    for (const code of [doc.barcodeNo, doc.oldBarcode]) {
      const key = txt(code).toUpperCase();
      if (!key) continue;
      if (!byBarcode.has(key)) byBarcode.set(key, []);
      if (!byBarcode.get(key).includes(doc)) byBarcode.get(key).push(doc);
    }
  }

  const beforeLoc = new Map();
  for (const doc of sourceDocs) {
    const key = `${txt(doc.businessId)}|${txt(doc.locationId)}|${txt(doc.status)}`;
    beforeLoc.set(key, (beforeLoc.get(key) || 0) + 1);
  }

  console.log(`Existing HSR records: ${sourceDocs.length}`);
  console.log(`Suppliers: ${sups.length}; groups: ${grps.length}; items: ${itms.length}\n`);

  const changes = [];
  const missing = [];
  const conflicts = [];
  const errors = [];
  const report = [];
  const fieldCounts = {};
  const matchedDocIds = new Set();
  let unchanged = 0;
  let matchedViaOld = 0;
  let statusQtyMismatch = 0;
  let ageMismatch = 0;
  let invalidDate = 0;
  let unresolvedSupplier = 0;
  let unresolvedGroup = 0;
  let unresolvedItem = 0;
  let grcPreserved = 0;
  let multiPositiveMatched = 0;
  let ambiguousMatched = 0;
  let correctedAges = 0;
  let dbDuplicates = 0;

  for (const [barcode, list] of groups) {
    const docs = byBarcode.get(barcode) || [];

    if (!docs.length) {
      const chosen = chooseWorkbookRow(list, null).chosen;
      missing.push({
        row: chosen.row,
        barcode,
        qty: chosen.qty,
        date: txt(getColumnValue(chosen.r, ['Date'])),
        supplier: txt(getColumnValue(chosen.r, ['Supplier Code'])),
        supplierName: txt(getColumnValue(chosen.r, ['Supplier Name'])),
        itemName: txt(getColumnValue(chosen.r, ['Item Name'])),
        group: txt(getColumnValue(chosen.r, ['Group Name'])),
        duplicateRows: list.length,
      });
      /* Not added to `report` here: the CSV appends every entry of `missing`
         below, with the supplier/item detail this row needs. */
      continue;
    }

    if (docs.length > 1) {
      dbDuplicates += 1;
      conflicts.push({ barcode, note: `barcode appears on ${docs.length} existing records` });
    }

    const rawDate = txt(getColumnValue(list[0].r, ['Date', 'Stock Date', 'As On Date']));
    if (rawDate && !parseWorkbookDate(rawDate)) invalidDate += 1;

    for (const doc of docs) {
      if (doc.barcodeNo && doc.barcodeNo.toUpperCase() !== barcode) matchedViaOld += 1;
      const pick = chooseWorkbookRow(list, doc);
      const chosen = pick.chosen;
      const notes = [];

      const skipLot = pick.multiPositive || pick.ambiguous;
      if (pick.multiPositive) {
        multiPositiveMatched += 1;
        conflicts.push({ barcode, note: 'several in-stock workbook rows share this barcode' });
      }
      if (pick.ambiguous) {
        ambiguousMatched += 1;
        conflicts.push({ barcode, note: 'workbook rows disagree and none matches the current lot' });
      }
      if (pick.duplicateRows) {
        notes.push(`workbook has ${list.length} rows; using row ${chosen.row}`);
      }

      const { desired, notes: fieldNotes } = buildSyncDesired(doc, chosen, ctx, skipLot);
      if (skipLot) {
        for (const field of ['grcNo', 'purRate', 'encodedPurRate', 'disc', 'retailPrice', 'offerPrice',
          'wspPrice', 'dpPrice', 'batchType', 'batchUnique', 'batchNo', 'qty', 'qtyNum',
          'openingQty', 'hsrPurPrice', 'stockDate', 'stockAge', 'finalNet']) {
          delete desired[field];
        }
      }
      notes.push(...fieldNotes);
      if (fieldNotes.some((n) => n.startsWith('supplier'))) unresolvedSupplier += 1;
      if (fieldNotes.some((n) => n.startsWith('group'))) unresolvedGroup += 1;
      if (fieldNotes.some((n) => n.startsWith('item'))) unresolvedItem += 1;
      if (fieldNotes.some((n) => n === 'GRC kept (workbook blank)')) grcPreserved += 1;

      const providedAge = txt(getColumnValue(chosen.r, ['Age', 'Stock Age']));
      const exDate = parseWorkbookDate(getColumnValue(chosen.r, ['Date', 'Stock Date', 'As On Date']))
        || parseWorkbookDate(getColumnValue(chosen.r, ['Purchase Date']));
      if (providedAge !== '' && exDate) {
        const derived = ageBetween(exDate, referenceDate);
        if (derived !== null && num(providedAge) !== derived) ageMismatch += 1;
      }

      const expectedStatus = chosen.qty > 0 ? BARCODE_STATUS.IN_STOCK : BARCODE_STATUS.SOLD;
      if (doc.status !== expectedStatus) {
        statusQtyMismatch += 1;
        notes.push(`status ${doc.status} vs workbook qty ${chosen.qty}`);
      }

      const set = {};
      const before = {};
      for (const [field, value] of Object.entries(desired)) {
        if (value === undefined) continue;
        if (sameValue(field, doc[field], value)) continue;
        set[field] = value;
        before[field] = doc[field] ?? null;
      }

      matchedDocIds.add(String(doc._id));

      if (Object.keys(set).length === 0) {
        unchanged += 1;
        report.push({ row: chosen.row, barcode, action: 'no-change', qty: chosen.qty, notes: notes.join('; ') });
        continue;
      }

      Object.keys(set).forEach((f) => { fieldCounts[f] = (fieldCounts[f] || 0) + 1; });
      if (set.stockAge !== undefined) correctedAges += 1;
      changes.push({
        _id: doc._id,
        barcodeNo: txt(doc.barcodeNo),
        row: chosen.row,
        status: doc.status,
        businessId: txt(doc.businessId),
        locationId: txt(doc.locationId),
        before,
        set,
        docBefore: doc,
        notes,
      });
      report.push({
        row: chosen.row,
        barcode,
        action: 'update',
        qty: chosen.qty,
        notes: notes.join('; '),
        fields: Object.keys(set).join('|'),
      });
    }
  }

  const missingQty = missing.reduce((n, m) => n + m.qty, 0);
  const dbOnly = sourceDocs.filter((d) => {
    const key = txt(d.barcodeNo).toUpperCase();
    return key && !groups.has(key) && !matchedDocIds.has(String(d._id));
  });

  console.log('='.repeat(80));
  console.log('SYNC ANALYSIS');
  console.log('='.repeat(80));
  console.log(`Workbook barcodes:        ${groups.size}`);
  console.log(`Matched existing records:  ${matchedDocIds.size}`);
  console.log(`No changes needed:         ${unchanged}`);
  console.log(`Records to update:         ${changes.length}`);
  console.log(`Missing in database:       ${missing.length} barcodes / ${missing.reduce((n, m) => n + m.duplicateRows, 0)} rows (qty ${missingQty.toFixed(2)})`);
  console.log(`DB records not in workbook:${String(dbOnly.length).padStart(5)} (left untouched)`);
  console.log(`Matched via old barcode:   ${matchedViaOld}`);
  console.log(`Duplicate existing rows:   ${dbDuplicates}`);
  console.log(`Status differs from qty:   ${statusQtyMismatch} (status is never changed)`);
  console.log(`Workbook Age/Date conflict:${String(ageMismatch).padStart(5)} (Date wins)`);
  console.log(`Unparsable workbook date:  ${invalidDate}`);
  console.log(`Unresolved supplier/group/item: ${unresolvedSupplier}/${unresolvedGroup}/${unresolvedItem}`);
  console.log(`GRC kept because blank:    ${grcPreserved}`);
  console.log(`Age fields corrected now:  ${correctedAges}`);
  console.log(`Ambiguous duplicate lots:  ${ambiguousMatched} (lot fields left untouched)`);

  if (Object.keys(fieldCounts).length) {
    console.log('\nField changes:');
    Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => console.log(`   ${field}: ${count}`));
  }

  if (changes.length) {
    console.log('\nSample updates:');
    console.table(changes.slice(0, 15).map((c) => ({
      row: c.row,
      barcode: c.barcodeNo,
      location: (locName.get(c.locationId) || c.locationId).substring(0, 30),
      status: c.status,
      changes: Object.entries(c.set).map(([f, v]) => `${f}: ${txt(c.before[f])} → ${txt(v)}`).join(', ').substring(0, 90),
    })));

    console.log('\nDate / age detail (first 10):');
    changes.filter((c) => c.set.stockDate !== undefined || c.set.stockAge !== undefined).slice(0, 10)
      .forEach((c) => console.log(`   ${c.barcodeNo}: ${dayKey(c.docBefore.stockDate) || '(none)'}/${c.docBefore.stockAge ?? '(none)'} → ${dayKey(c.set.stockDate ?? c.docBefore.stockDate) || '(none)'}/${c.set.stockAge ?? c.docBefore.stockAge ?? '(none)'}`));
  }

  if (missing.length) {
    console.log(`\nMissing sample (first 10 of ${missing.length}):`);
    console.table(missing.slice(0, 10).map((m) => ({ row: m.row, barcode: m.barcode, qty: m.qty, date: m.date, supplier: `${m.supplier} ${m.supplierName || ''}`.trim(), item: (m.itemName || '').substring(0, 25) })));
  }

  if (dbOnly.length) {
    console.log(`\nDB-only sample (first 10 of ${dbOnly.length}):`);
    console.table(dbOnly.slice(0, 10).map((d) => ({ barcode: d.barcodeNo, status: d.status, source: d.source, location: locName.get(txt(d.locationId)) || d.locationId })));
  }

  /* Backup + apply */
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.resolve(process.cwd(), 'scripts', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const reportFile = path.join(reportDir, `hsr-opening-sync-${APPLY ? 'applied' : 'dryrun'}-${timestamp}.csv`);
  fs.writeFileSync(reportFile, [
    'row,barcode,action,qty,fields,notes',
    ...report.map((x) => [x.row, x.barcode, x.action, x.qty, x.fields || '', x.notes].map(csv).join(',')),
    ...missing.map((m) => [m.row, m.barcode, 'missing-in-db', m.qty, '', `supplier ${m.supplier} ${m.supplierName || ''}; item ${m.itemName || ''}`].map(csv).join(',')),
  ].join('\n'));

  const detailFile = path.join(reportDir, `hsr-opening-sync-changes-${APPLY ? 'applied' : 'dryrun'}-${timestamp}.csv`);
  fs.writeFileSync(detailFile, [
    'barcode,field,before,after',
    ...changes.flatMap((c) => Object.entries(c.set).map(([f, v]) => [c.barcodeNo, f, c.before[f], v].map(csv).join(','))),
  ].join('\n'));

  console.log(`\nReport: ${path.relative(process.cwd(), reportFile)}`);
  console.log(`Change detail: ${path.relative(process.cwd(), detailFile)}`);

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN - NO CHANGES MADE. Add --apply to write.');
    console.timeEnd('total');
    await mongoose.disconnect();
    return;
  }

  if (!changes.length) {
    console.log('\n✅ Nothing to write - database already matches the workbook.');
    console.timeEnd('total');
    await mongoose.disconnect();
    return;
  }

  const backupDir = path.resolve(process.cwd(), '.backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `hsr-opening-sync-backup-${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: 'HSR_OPENING_FULL_FIELD_SYNC',
    source: SOURCE,
    file: FILE,
    count: changes.length,
    records: changes.map((c) => ({ _id: c._id, barcodeNo: c.barcodeNo, before: c.docBefore, set: c.set })),
  }, null, 2));
  console.log(`\nBackup: ${path.relative(process.cwd(), backupFile)} (${changes.length} full records)`);

  console.log(`\nWriting ${changes.length} records...`);
  for (let i = 0; i < changes.length; i += CHUNK) {
    const chunk = changes.slice(i, i + CHUNK);
    const ops = chunk.map((c) => ({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { ...c.set, updatedAt: new Date() } },
      },
    }));
    const res = await db.collection('barcodeLabel').bulkWrite(ops, { ordered: false });
    console.log(`   updated ${Math.min(i + CHUNK, changes.length)}/${changes.length} (matched ${res.matchedCount}, modified ${res.modifiedCount})`);
  }

  const ids = changes.map((c) => c._id);
  const afterDocs = [];
  for (let i = 0; i < ids.length; i += 500) {
    afterDocs.push(...await db.collection('barcodeLabel').find({ _id: { $in: ids.slice(i, i + 500) } }).toArray());
  }
  const afterById = new Map(afterDocs.map((d) => [String(d._id), d]));
  const remaining = [];
  let protectedChanged = 0;
  for (const c of changes) {
    const doc = afterById.get(String(c._id));
    if (!doc) { remaining.push({ barcode: c.barcodeNo, field: '(record)' }); continue; }
    for (const [field, value] of Object.entries(c.set)) {
      if (!sameValue(field, doc[field], value)) {
        remaining.push({ barcode: c.barcodeNo, field, expected: txt(value), actual: txt(doc[field]) });
      }
    }
    for (const field of SYNC_PROTECTED) {
      if (!sameValue(field, c.docBefore[field], doc[field])) protectedChanged += 1;
    }
  }

  const afterDocsAll = await db.collection('barcodeLabel').find({ source: SOURCE }).toArray();
  const afterLoc = new Map();
  for (const doc of afterDocsAll) {
    const key = `${txt(doc.businessId)}|${txt(doc.locationId)}|${txt(doc.status)}`;
    afterLoc.set(key, (afterLoc.get(key) || 0) + 1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION');
  console.log('='.repeat(80));
  console.log(`Records re-read:           ${afterDocs.length}`);
  console.log(`Fields still different:    ${remaining.length}`);
  console.log(`Protected fields changed:  ${protectedChanged}`);
  if (remaining.length) console.table(remaining.slice(0, 20));
  console.log('\nLocation/status counts (before → after):');
  const allLocKeys = new Set([...beforeLoc.keys(), ...afterLoc.keys()]);
  for (const key of [...allLocKeys].sort()) {
    const [biz, loc, status] = key.split('|');
    console.log(`   ${(bizName.get(biz) || biz).substring(0, 28)} | ${(locName.get(loc) || loc).substring(0, 28)} | ${status}: ${beforeLoc.get(key) || 0} → ${afterLoc.get(key) || 0}`);
  }

  const dupes = await db.collection('barcodeLabel').aggregate([
    { $match: { source: SOURCE } },
    { $group: { _id: '$barcodeNo', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'groups' },
  ]).toArray();
  console.log(`\nDuplicate barcodeNo groups after sync: ${dupes[0]?.groups || 0}`);

  if (remaining.length === 0 && protectedChanged === 0) {
    console.log('\n✅ SYNC VERIFIED - every updated field re-read identical; barcode, location, business, status and links untouched.');
  } else {
    console.log('\n⚠️  VERIFICATION FOUND DIFFERENCES - inspect the rows above before relying on this run.');
  }

  console.timeEnd('total');
  await mongoose.disconnect();
}

/* Main */
async function main() {
  if (SYNC) return runSync();
  console.time('total');
  const file = path.resolve(process.cwd(), FILE);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set - run with --env-file=.env');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`HSR OPENING STOCK SEEDING - 19-10-2026`);
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY (WRITE)' : '🟡 DRY RUN (READ ONLY)'}`);
  console.log(`File: ${FILE}`);
  console.log(`Financial Year: ${FIN_YEAR}`);
  console.log(`Limit: ${LIMIT === 0 ? 'ALL ROWS' : LIMIT + ' rows'}`);
  console.log(`Chunk: ${CHUNK}`);
  console.log('='.repeat(80) + '\n');

  /* ---------- Read Excel ---------- */
  console.log(`📂 Reading file: ${file}`);
  const wb = XLSX.readFile(file);
  console.log(`✅ Excel file loaded`);
  console.log(`📋 Worksheets found: ${wb.SheetNames.join(', ')}\n`);

  const sheetName = wb.SheetNames[0];
  console.log(`📄 Using sheet: ${sheetName}`);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: '' });
  console.log(`✅ Converted to JSON: ${all.length} rows`);
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all;

  // Process in-stock (qty > 0) rows BEFORE qty-0 rows so a sold duplicate
  // never claims a barcode ahead of its in-stock twin. Stable sort keeps
  // original order within each group; excelRow keeps the real row number.
  const qtyOf = (r) => num(getColumnValue(r, ['Open Qty', 'Close Qty', 'Quantity', 'Qty', 'Stock Qty']));
  const indexed = rows
    .map((r, idx) => ({ r, excelRow: idx + 2 }))
    .sort((a, b) => (qtyOf(b.r) > 0) - (qtyOf(a.r) > 0));

  console.log(`📊 Total rows in file: ${all.length}, rows to process: ${rows.length}\n`);
  if (rows.length === 0) throw new Error('No data rows found in Excel file');

  const headers = Object.keys(rows[0]);
  console.log(`📝 Detected ${headers.length} columns:`);
  headers.forEach((h, i) => console.log(`   ${String(i + 1).padStart(2)}. ${h}`));
  console.log();

  /* ---------- Connect ---------- */
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000,
  });
  console.log(`✅ Connected to MongoDB`);
  const db = mongoose.connection.db;
  const supplierColl = db.collection(contactCollection('Supplier'));

  const businesses = await db.collection('business').find({}, { projection: { name: 1 } }).toArray();
  const bizName = new Map(businesses.map((b) => [String(b._id), b.name]));
  const locations = (await db.collection('companylocation').find({}, { projection: { name: 1, businessId: 1 } }).toArray())
    .filter((l) => bizName.has(String(l.businessId)));
  console.log(`🏢 Loaded ${businesses.length} businesses, ${locations.length} locations`);

  const targetLoc = locations.find((l) => norm(l.name) === norm(DEFAULT_LOCATION));
  if (!targetLoc) throw new Error(`Location "${DEFAULT_LOCATION}" not found`);
  console.log(`📍 Default Location: "${DEFAULT_LOCATION}"\n`);

  /* ---------- Preload existing barcodes ---------- */
  /* Source-wide, not just the target location: the earlier 50/50 split moved
     half of this source's rows to the HSR business. A target-location-only
     check would not see them and a second run would create duplicates. */
  console.log(`⚡ Pre-loading existing barcodes...`);
  const existingBarcodes = await db.collection('barcodeLabel').find({
    $or: [
      { source: SOURCE },
      {
        businessId: String(targetLoc.businessId),
        $or: [
          { currentLocationId: targetLoc._id },
          { locationId: String(targetLoc._id) },
        ],
      },
    ],
  }, { projection: { barcodeNo: 1, barcodeGenerated: 1, oldBarcode: 1, status: 1, qtyNum: 1 } }).toArray();

  const existingMap = new Map();
  existingBarcodes.forEach((b) => {
    [b.barcodeNo, b.barcodeGenerated, b.oldBarcode].filter(Boolean).forEach((c) => {
      existingMap.set(String(c).toUpperCase(), { status: b.status, qtyNum: b.qtyNum });
    });
  });
  console.log(`✅ ${existingBarcodes.length} existing barcodes (${existingMap.size} unique codes)\n`);

  /* ---------- Preload masters ---------- */
  console.log(`⚡ Pre-loading masters...`);
  const [sups, grps, hsns, uoms, itms] = await Promise.all([
    supplierColl.find({ contactKind: 'Supplier' }, { projection: { businessId: 1, contactId: 1, businessName: 1 } }).toArray(),
    db.collection('productgroup').find({ parentId: null }).toArray(),
    db.collection('hsn').find({}, { projection: { businessId: 1, code: 1 } }).toArray(),
    db.collection('uom').find({}).toArray(),
    db.collection('item').find({}, { projection: { businessId: 1, name: 1, itemCode: 1 } }).toArray(),
  ]);

  const supByCode = new Map();
  const supByName = new Map();
  const grpMap = new Map();
  const hsnMap = new Map();
  const uomMap = new Map();
  const itemMap = new Map();

  sups.forEach((s) => {
    if (txt(s.contactId)) supByCode.set(`${s.businessId}|${norm(s.contactId)}`, s);
    if (txt(s.businessName)) supByName.set(`${s.businessId}|${norm(s.businessName)}`, s);
  });
  grps.forEach((g) => grpMap.set(`${g.businessId}|${norm(g.name)}`, g));
  hsns.forEach((h) => hsnMap.set(`${h.businessId}|${txt(h.code)}`, h));
  uoms.forEach((u) => {
    if (txt(u.shortName)) uomMap.set(`${u.businessId}|${norm(u.shortName)}`, u);
    if (txt(u.name)) uomMap.set(`${u.businessId}|${norm(u.name)}`, u);
  });
  itms.forEach((i) => {
    if (txt(i.name)) itemMap.set(`${i.businessId}|${norm(i.name)}`, i);
    if (txt(i.itemCode)) itemMap.set(`${i.businessId}|${norm(i.itemCode)}`, i);
  });
  console.log(`✅ ${sups.length} suppliers, ${grps.length} groups, ${hsns.length} hsn, ${uoms.length} uom, ${itms.length} items\n`);

  /* ---------- Cache + queued inserts ---------- */
  const cache = new Map();
  const cached = async (key, fn) => {
    if (!cache.has(key)) cache.set(key, await fn());
    return cache.get(key);
  };
  const created = { supplier: [], group: [], hsn: [], item: [] };
  const pending = {}; // collection -> docs[]

  const insert = async (coll, doc) => {
    const now = new Date();
    const full = { ...doc, _id: new ObjectId(), createdAt: now, updatedAt: now, __v: 0 };
    if (APPLY) (pending[coll] ||= []).push(full);
    else full.__dry = true;
    return full;
  };

  const supplierFor = async (biz, code, name) => {
    if (!txt(code) && !txt(name)) return null;
    const found = supByCode.get(`${biz}|${norm(code)}`) || supByName.get(`${biz}|${norm(name)}`);
    if (found) return found;
    const type = await cached(`ctype|${biz}`, async () =>
      (await db.collection('contacttype').findOne({ businessId: biz, contactType: 'Supplier', prefix: /^g$/i }))
      || (await db.collection('contacttype').findOne({ businessId: biz, contactType: 'Supplier' })));
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
    if (txt(code)) supByCode.set(`${biz}|${norm(code)}`, doc);
    if (txt(name)) supByName.set(`${biz}|${norm(name)}`, doc);
    created.supplier.push(`${txt(code)} ${txt(name)}`);
    return doc;
  };

  const groupFor = async (biz, name) => {
    if (!txt(name)) return null;
    const k = `${biz}|${norm(name)}`;
    if (grpMap.has(k)) return grpMap.get(k);
    const doc = await insert('productgroup', { businessId: biz, name: txt(name), prefix: '', parentId: null });
    grpMap.set(k, doc);
    created.group.push(txt(name));
    return doc;
  };

  const taxFor = (biz, gst) => cached(`tax|${biz}|${gst}`, async () => {
    const list = await db.collection('tax').find({ businessId: biz, igst: num(gst) }).toArray();
    return list.find((t) => /^gst/i.test(txt(t.taxName))) || list[0] || null;
  });

  const hsnFor = async (biz, code, gst) => {
    if (!txt(code)) return null;
    const k = `${biz}|${txt(code)}`;
    if (hsnMap.has(k)) return hsnMap.get(k);
    const tax = await taxFor(biz, gst);
    const doc = await insert('hsn', {
      businessId: biz,
      code: txt(code),
      status: 'Active',
      effectiveDate: new Date(),
      description: '',
      taxSlabs: tax ? [{ gstTaxNameId: tax._id, amountFrom: 0, amountTo: 0 }] : [],
    });
    hsnMap.set(k, doc);
    created.hsn.push(txt(code) + (tax ? ` (${tax.taxName})` : ' (no tax slab)'));
    return doc;
  };

  const uomFor = async (biz, uom) => (txt(uom) ? uomMap.get(`${biz}|${norm(uom)}`) || null : null);

  const itemFor = async (biz, code, ctx) => {
    if (!txt(code)) return null;
    const k = `${biz}|${norm(code)}`;
    if (itemMap.has(k)) return itemMap.get(k);
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
    itemMap.set(k, doc);
    created.item.push(txt(code));
    return doc;
  };

  const rateMapping = (biz, loc) => cached(`prc|${biz}|${loc}`, async () => {
    const doc = await db.collection('purchaseratecode').findOne({ businessId: biz, locationId: loc });
    return doc && doc.isActive !== false ? doc.digitMappings : null;
  });

  /* ---------- Process rows (all in memory) ---------- */
  const report = [];
  const toWrite = [];
  const seenHere = new Set();
  let processedCount = 0;

  console.log('🔄 Processing rows...\n');
  console.time('rows');

  for (let i = 0; i < indexed.length; i += 1) {
    const { r, excelRow } = indexed[i];

    const barcode = txt(getColumnValue(r, ['Item Code', 'Barcode', 'Barcode No', 'ItemCode']));
    const locName = txt(getColumnValue(r, ['Location Name', 'Location', 'Loc Name'])) || DEFAULT_LOCATION;
    const qty = num(getColumnValue(r, ['Open Qty', 'Close Qty', 'Quantity', 'Qty', 'Stock Qty']));
    const itemName = txt(getColumnValue(r, ['Item Name', 'Item', 'ItemName']));
    const stockDate = parseDate(getColumnValue(r, ['Date', 'Stock Date', 'As On Date']));
    const age = num(getColumnValue(r, ['Age', 'Stock Age'])) || calculateAge(stockDate);

    const line = { row: excelRow, barcode, location: locName, qty, age, openingQty: 0, hsrPurPrice: 0, action: '', note: '', masters: '' };
    report.push(line);

    if (!barcode) { line.action = 'error'; line.note = 'No barcode'; continue; }

    const history = qty <= 0;
    if (history && !INCLUDE_ZERO) { line.action = 'skipped-qty0'; line.note = 'Qty=0'; continue; }

    const locs = locations.filter((l) => norm(l.name) === norm(locName));
    if (locs.length !== 1) {
      line.action = 'error';
      line.note = locs.length ? `Loc "${locName}" in ${locs.length} biz` : `Loc "${locName}" not found`;
      continue;
    }
    const loc = locs[0];
    const biz = loc.businessId;
    line.location = `${loc.name} (${bizName.get(String(biz))})`;

    const key = `${String(biz)}|${String(loc._id)}|${barcode.toUpperCase()}`;
    const existingInfo = existingMap.get(barcode.toUpperCase());

    if (existingInfo || seenHere.has(key)) {
      line.action = 'skipped-exists';
      line.note = existingInfo ? `Exists (${existingInfo.status}, qty ${existingInfo.qtyNum})` : 'Dup in Excel';
      continue;
    }
    seenHere.add(key);

    const before = { s: created.supplier.length, g: created.group.length, h: created.hsn.length, i: created.item.length };
    const supplier = await supplierFor(biz, getColumnValue(r, ['Supplier Code', 'SupplierCode']), getColumnValue(r, ['Supplier Name', 'Supplier']));
    const group = await groupFor(biz, getColumnValue(r, ['Group Name', 'Group']));
    const hsn = await hsnFor(biz, getColumnValue(r, ['HSN', 'HSN Code']), getColumnValue(r, ['GST %', 'GST']));
    const item = await itemFor(biz, itemName || barcode, { group, hsn, uom: getColumnValue(r, ['UOM', 'Unit']) });

    const made = [
      created.supplier.length > before.s && 'supplier',
      created.group.length > before.g && 'group',
      created.hsn.length > before.h && 'hsn',
      created.item.length > before.i && 'item',
    ].filter(Boolean);
    line.masters = made.length ? made.join(',') : 'existing';

    const attrs = parseAttributes(getColumnValue(r, ['Item Attributes', 'Attributes']));
    const uom = txt(getColumnValue(r, ['UOM', 'Unit']));
    const typed = txt(getColumnValue(r, ['Batch/Unique', 'Type'])).toLowerCase();
    const batchType = typed === 'batch' || typed === 'unique' ? typed : (qty > 1 ? 'batch' : 'unique');
    const purRate = money(getColumnValue(r, ['hsr pur price', 'JNR Purchase Rate', 'Purchase Rate', 'PurRate']));
    const printDescription = txt(getColumnValue(r, ['Print Description', 'Description']));
    
    // NEW: Read opening stock audit fields
    const openingQty = num(getColumnValue(r, ['Open Qty', 'Opening Qty', 'Qty']));
    const hsrPurPrice = num(getColumnValue(r, ['hsr pur price', 'HSR Pur Price', 'HSR Purchase Price', 'Pur Price', 'Purchase Price']));
    
    // Store in line for report
    line.openingQty = openingQty;
    line.hsrPurPrice = hsrPurPrice;
    
    // Validation: hsrPurPrice must be >= 0
    if (hsrPurPrice < 0) {
      line.action = 'error';
      line.note = 'hsrPurPrice is negative';
      continue;
    }

    toWrite.push({
      line,
      doc: {
        grcId: '',
        grcNo: txt(getColumnValue(r, ['GRC No', 'GRC'])),
        supplierId: supplier ? String(supplier._id) : '',
        groupId: group ? String(group._id) : '',
        barcodeNo: barcode,
        oldBarcode: barcode,
        barcodeGenerated: '',
        itemCode: itemName || barcode,
        itemId: item?._id || null,
        itemName: item?.name || itemName || barcode,
        printDescription,
        supplierDescription: attrs.supplierDescription,
        p_m_f: attrs.pmf,
        designNo: attrs.supplierDescription || printDescription,
        qty: String(Math.max(0, qty)),
        qtyNum: Math.max(0, qty),
        openingQty,         // NEW: Raw Open Qty from Excel
        hsrPurPrice,        // NEW: HSR purchase price from Excel
        uom,
        uomType: uomTypeOf(uom),
        hsn: txt(getColumnValue(r, ['HSN', 'HSN Code'])),
        gst: money(getColumnValue(r, ['GST %', 'GST'])),
        purRate,
        encodedPurRate: encodeRate(purRate, await rateMapping(biz, loc._id)),
        disc: money(getColumnValue(r, ['Discount %', 'Discount', 'Disc'])),
        finalNet: money(getColumnValue(r, ['Final Net Rate', 'Net Rate'])),
        retailPrice: money(getColumnValue(r, ['RSP', 'Retail Price'])),
        offerPrice: money(getColumnValue(r, ['RSP Offer Price', 'Offer'])),
        wspPrice: money(getColumnValue(r, ['WSP'])),
        dpPrice: money(getColumnValue(r, ['DP'])),
        batchType,
        batchUnique: batchType,
        batchNo: batchType === 'batch' ? barcode : '',
        businessId: String(biz),
        locationId: String(loc._id),
        finYear: FIN_YEAR,
        status: history ? BARCODE_STATUS.SOLD : BARCODE_STATUS.IN_STOCK,
        currentLocationId: loc._id,
        currentBusinessId: biz,
        stockDate,
        stockAge: age,
        source: SOURCE,
        importedFrom: { file: FILE, row: excelRow, sheet: sheetName },
      },
    });

    line.action = (APPLY ? 'seeded' : 'will-seed') + (history ? '-sold' : '');
    if (history) line.note = 'Qty=0,SOLD';

    processedCount++;
    if (processedCount % 2000 === 0) {
      console.log(`   Processed ${processedCount} (${((processedCount / rows.length) * 100).toFixed(1)}%)...`);
    }
  }

  console.timeEnd('rows');
  console.log(`\n✅ Processed: ${processedCount} rows\n`);

  /* ---------- Apply ---------- */
  if (APPLY && toWrite.length > 0) {
    console.time('write');

    // 1. New masters in bulk
    for (const [coll, docs] of Object.entries(pending)) {
      for (let i = 0; i < docs.length; i += 5000) {
        await db.collection(coll).insertMany(docs.slice(i, i + 5000), { ordered: false });
      }
      console.log(`   masters → ${coll}: ${docs.length}`);
    }

    // 2. Barcodes + stock movements in chunks
    console.log(`💾 Writing ${toWrite.length} barcodes in chunks of ${CHUNK}...\n`);
    let written = 0;

    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const chunk = toWrite.slice(i, i + CHUNK);
      try {
        await withTransaction(async (session) => {
          const now = new Date();
          const docs = chunk.map(({ doc }) => {
            const { stockDate, stockAge, ...rest } = doc;
            return {
              _id: new ObjectId(),
              ...rest,
              ...(stockDate && { stockDate }),
              ...(stockAge && { stockAge }),
              createdAt: now,
              updatedAt: now,
              __v: 0,
            };
          });

          // Raw driver insert: no per-doc mongoose validation/hooks (fast)
          await BarcodeLabel.collection.insertMany(docs, { ordered: true, ...(session && { session }) });

          const inStock = docs.filter((d) => d.status === BARCODE_STATUS.IN_STOCK);
          if (inStock.length) {
            await applyMovement({
              units: inStock,
              expect: null,
              set: {
                status: BARCODE_STATUS.IN_STOCK,
                currentLocationId: targetLoc._id,
                currentBusinessId: targetLoc.businessId,
              },
              movement: {
                type: MOVEMENT_TYPES.GRC_IN,
                direction: 'in',
                toLocationId: targetLoc._id,
                refModel: SOURCE,
                refNo: '',
                reason: `HSR Opening 19-10 (chunk ${Math.floor(i / CHUNK) + 1})`,
                finYear: FIN_YEAR,
              },
              session,
            });
          }
        });
        written += chunk.length;
        console.log(`   written ${written}/${toWrite.length}`);
      } catch (err) {
        chunk.forEach(({ line }) => { line.action = 'error'; line.note = 'Chunk failed: ' + err.message; });
        console.error(`   ❌ chunk ${Math.floor(i / CHUNK) + 1} failed: ${err.message}`);
      }
    }
    console.timeEnd('write');
    console.log(`✅ Written: ${written}\n`);
  }

  /* ---------- Summary ---------- */
  report.sort((a, b) => a.row - b.row);
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80) + '\n');

  console.table(report.slice(0, 20).map(({ row, barcode, location, qty, age, action, note }) =>
    ({ row, barcode, location: location.substring(0, 30), qty, age, action, note: note.substring(0, 40) })));
  if (report.length > 20) console.log(`\n... and ${report.length - 20} more (see CSV)\n`);

  const count = (a) => report.filter((x) => x.action === a).length;
  const verb = APPLY ? 'seeded' : 'will-seed';

  console.log(`\n📈 Stats:`);
  console.log(`   ${verb}: ${count(verb)}`);
  console.log(`   ${verb}-sold: ${count(verb + '-sold')}`);
  console.log(`   skipped-qty0: ${count('skipped-qty0')}`);
  console.log(`   skipped-exists: ${count('skipped-exists')}`);
  console.log(`   errors: ${count('error')}\n`);

  ['supplier', 'group', 'hsn', 'item'].forEach((k) => {
    if (created[k].length) console.log(`${APPLY ? 'Created' : 'Will create'} ${k}: ${created[k].length}`);
  });

  const dir = path.resolve(process.cwd(), 'scripts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(dir, `hsr-opening-19-10-${APPLY ? 'applied' : 'dryrun'}-${timestamp}.csv`);
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  fs.writeFileSync(out, [
    'row,barcode,location,qty,openingQty,hsrPurPrice,age,action,masters,note',
    ...report.map((x) => [x.row, x.barcode, x.location, x.qty, x.openingQty || '', x.hsrPurPrice || '', x.age || '', x.action, x.masters, x.note].map(csv).join(',')),
  ].join('\n'));
  console.log(`\n📄 Report: ${path.relative(process.cwd(), out)}`);

  /* ===============================================
   * PHASE 2: Transfer locationId to HSR (optional)
   * =============================================== */
  if (APPLY && TRANSFER_TO_HSR) {
    console.log('\n' + '='.repeat(80));
    console.log('🚚 PHASE 2: TRANSFERRING locationId to HSR LOCATION');
    console.log('='.repeat(80) + '\n');
    
    // Transfer ALL HSR_OPENING barcodes to HSR location (regardless of current location)
    const query = {
      source: SOURCE,
      businessId: '6a853cdefb266c4358beb548',
    };
    
    // Count how many need transfer (not already at HSR)
    const needTransfer = await db.collection('barcodeLabel').countDocuments({
      ...query,
      locationId: { $ne: HSR_LOCATION_ID }
    });
    
    const toTransfer = await db.collection('barcodeLabel').find(query).toArray();
    console.log(`📦 Total HSR barcodes: ${toTransfer.length}`);
    console.log(`🔄 Need location transfer: ${needTransfer}\n`);
    
    if (needTransfer > 0) {
      // Create backup
      const backupDir = './backups';
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupFile = path.join(backupDir, `hsr-location-transfer-backup-${Date.now()}.json`);
      
      const backupData = toTransfer.map(bc => ({
        _id: bc._id,
        barcodeNo: bc.barcodeNo,
        old_locationId: bc.locationId,
        new_locationId: HSR_LOCATION_ID,
      }));
      
      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup saved → ${backupFile}`);
      console.log(`   (${toTransfer.length} records backed up)\n`);
      
      // Apply transfer - update ALL HSR barcodes
      console.log('🔄 Updating locationId for all HSR barcodes...');
      const result = await db.collection('barcodeLabel').updateMany(
        query,  // All HSR barcodes
        { 
          $set: { 
            locationId: HSR_LOCATION_ID,
            currentLocationId: new mongoose.Types.ObjectId(HSR_LOCATION_ID)
          } 
        }
      );
      
      console.log(`✅ Matched: ${result.matchedCount}  |  Modified: ${result.modifiedCount}\n`);
      
      // Verify
      const atHsr = await db.collection('barcodeLabel').countDocuments({
        source: SOURCE,
        businessId: '6a853cdefb266c4358beb548',
        locationId: HSR_LOCATION_ID,
      });
      
      const wrong = await db.collection('barcodeLabel').countDocuments({
        source: SOURCE,
        businessId: '6a853cdefb266c4358beb548',
        locationId: { $ne: HSR_LOCATION_ID },
      });
      
      console.log(`✅ Now at HSR location: ${atHsr}`);
      if (wrong === 0) {
        console.log('✅ Verification passed — all HSR barcodes transferred');
      } else {
        console.log(`⚠️  Warning: ${wrong} record(s) still at different location`);
      }
      
      console.log('\n📌 TO ROLLBACK: Restore from backup file if needed');
    } else {
      console.log('✅ All barcodes already at HSR location — no transfer needed');
    }
  } else if (TRANSFER_TO_HSR && !APPLY) {
    console.log('\n⚠️  --transfer-hsr requires --apply flag');
  }

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN - NO CHANGES MADE. Add --apply to write.');
  } else {
    console.log('\n✅ IMPORT COMPLETED!');
  }

  console.timeEnd('total');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ FAILED:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
