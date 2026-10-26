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

   WAREHOUSE STOCK MODE - item_stock_item_wise_summary workbook

     node scripts/seed-warehouse-stock.js --profile temple --file "C:\path\workbook.xlsx"
     node scripts/seed-warehouse-stock.js --profile suvarna --file "C:\path\suvarnafabric.xlsx"
     node scripts/seed-warehouse-stock.js --profile omshree --file "C:\path\omshreefabric.xlsx"

   The launcher runs THIS file with --warehouse-stock and the alias hook.
   Profiles live in WS_PROFILES below. Each profile supplies its businessId,
   source, expected Excel locations and workbook facts. The mode matches Item
   master by Item Code then Item Name, Supplier master by code then name inside
   the profile business, and writes barcodeLabel + stockMovement. Reports go to
   ./seed_reports/<profile>/. Defaults: DRY_RUN=true, SKIP_ZERO_QTY=true,
   FIN_YEAR='2026-2027'. A real write needs --confirm.
   --allow-missing-items is an explicit opt-in for businesses whose Item master
   is empty: it seeds with itemId=null but keeps the workbook itemCode/itemName.
   It never creates Item rows.
   --allow-cross-business-items lets a blank local Item master match an exact
   Item Name in another business and pass that itemId through. No Item row is
   copied or created. --backfill-item-ids is the repair mode: it changes only
   itemId on existing docs and never writes quantities or stock movements.

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

/* ==============================================================================
   WAREHOUSE STOCK SEED CONFIG (item_stock_item_wise_summary workbook)

   This block is the single place the warehouse-stock mode is configured.
   The mode is entered with --warehouse-stock and is driven by the thin
   entry point scripts/seed-warehouse-stock.js.

   Profiles are the only place businessId, source, expected Excel locations
   and the expected workbook facts live.  The Temple profile pins its known
   warehouse _id so the long-standing Temple command keeps working unchanged;
   Suvarna/Omshree resolve the warehouse from their business's companylocation
   rows and abort if the choice is ambiguous.

   DRY_RUN          true = no writes unless --confirm is passed
   SKIP_ZERO_QTY    true = skip Close Qty <= 0
   FIN_YEAR         financial year stamped on every seeded unit
   AS_OF_DATE       fallback as-of date for stockDate/stockAge when the file
                    name carries no YYYYMMDD export date

   BATCH_UNIQUE_CASE  'title'  -> batchUnique "Batch" / "Unique" (workbook casing)
                      'lower'  -> batchUnique "batch" / "unique" (barcode-generation casing)
   ITEM_CODE_MODE     'barcode' -> itemCode = Excel Item Code (per spec)
                      'master'  -> itemCode = Item master code (item-wise reports group)
   ============================================================================== */
const WS_CONFIG = {
  DEFAULT_PROFILE: 'temple',
  DRY_RUN: true,
  SKIP_ZERO_QTY: true,
  FIN_YEAR: '2026-2027',
  AS_OF_DATE: '2026-10-19',
  CHUNK: 500,
  BATCH_UNIQUE_CASE: 'title',
  ITEM_CODE_MODE: 'barcode',
};

const WS_PROFILES = {
  temple: {
    key: 'temple',
    businessId: '6a853cdefb266c4358beb548',
    businessName: 'TEMPLE FABRICS',
    gstin: '29AANFT6295P1ZW',
    warehouseName: 'TEMPLE FABRICS WAREHOUSE',
    /* Pinned so the existing Temple command stays stable. The resolver still
       verifies it belongs to businessId. --warehouse-id overrides it. */
    warehouseId: '6a858ded9d37d436b1fc02dc',
    includeLocationNames: ['Temple Fabrics Warehouse'],
    source: 'temple_warehouse_excel_seed',
    asOfDate: '2026-10-19',
    expected: {
      dataRows: 33357,
      locations: { 'Temple Fabrics Warehouse': 17315, 'TEMPLE FABRIC JNR': 16042 },
    },
  },
  suvarna: {
    key: 'suvarna',
    businessId: '6a853bf6fb266c4358beb538',
    businessName: 'SUVARNA FABRICS',
    gstin: '29ADVFS2216A1Z1',
    warehouseName: 'SUVARNA FABRICS',
    includeLocationNames: ['SUVARNA FABRICS'],
    source: 'suvarna_excel_seed',
    asOfDate: '2026-10-19',
    expected: {
      dataRows: 22833,
      locations: { 'SUVARNA FABRICS': 22833 },
      suppliers: 1,
      groups: 14,
      uom: { Mtr: 18847, 'Pc(s)': 3986 },
      batch: { '(blank)': 20792, Unique: 1373, Batch: 668 },
      nonPositive: 2114,
      sumQty: 51449.52,
      duplicateExtraRows: 216,
      blankSupplierCode: 0,
      fractionalPc: 0,
    },
  },
  omshree: {
    key: 'omshree',
    businessId: '6a8c2b88c67379ce90586ece',
    businessName: 'OMSHREE FABS (TEMPLE FABRICS , SILKS AND SAREES)',
    gstin: '29AAGFO9624G1ZW',
    warehouseName: 'TEMPLE FABRICS WAREHOUSE',
    includeLocationNames: ['Temple Fabrics Warehouse'],
    source: 'omshree_excel_seed',
    asOfDate: '2026-10-19',
    expected: {
      dataRows: 33357,
      locations: { 'Temple Fabrics Warehouse': 17315, 'TEMPLE FABRIC JNR': 16042 },
      suppliers: 453,
      groups: 16,
      uom: { 'Pc(s)': 17653, Mtr: 15704 },
      batch: { '(blank)': 21076, Unique: 10869, Batch: 1412 },
      nonPositive: 14276,
      sumQty: 71456.30,
      duplicateExtraRows: 21,
      blankSupplierCode: 71,
      fractionalPc: 11,
    },
  },
};

/* --name=value and --name value both work for the warehouse mode. */
const wsArg = (name, def) => {
  const eq = process.argv.find((a) => a.startsWith('--' + name + '='));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
};

/* Every occurrence, so --include can be repeated. */
const wsAllArgs = (name) => {
  const out = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    const a = process.argv[i];
    if (a === '--' + name && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
      out.push(process.argv[i + 1]);
      i += 1;
    } else if (a.startsWith('--' + name + '=')) {
      out.push(a.slice(name.length + 3));
    }
  }
  return out;
};

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

/* ==============================================================================
   WAREHOUSE STOCK SEED - item_stock_item_wise_summary_<date>.xlsx

   ONE warehouse, ONE workbook, one stock row per barcode (or per batch lot).
   The workbook is the stock summary of the other ERP; Item Code is the unit's
   barcode, NOT the Item master's style code (that is Item Code_1's role in the
   HSR workbook). Master matching therefore falls back to Item Name, with the
   workbook's Group/Sub Group used to choose between same-named masters.

   What is written:
     barcodeLabel  - the unit / batch row (the stock the reports read)
     stockMovement - one GRC_IN per new unit, ADJUST_IN/OUT only when a re-run
                     changes an existing seeded unit's quantity

   Nothing else is touched: there is no separate item-wise stock summary or
   location-stock collection in this repo - app/api/reports/* derive stock from
   barcodeLabel and stockMovement. Creating a second store would give two
   answers to "what is in stock".
   ============================================================================== */

const WS_PRICE_FIELDS = ['purRate', 'disc', 'finalNet', 'retailPrice', 'offerPrice', 'wspPrice', 'dpPrice', 'gst'];

/* Keep the workbook's decimal text ("695.00" stays "695.00") but drop the
   thousands separators the sheet formatter may add. */
const wsPriceText = (v) => txt(v).replace(/,/g, '');

const wsPriceNum = (v) => num(String(v ?? '').replace(/,/g, ''));

const wsSame = (a, b) => {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return txt(a) === txt(b);
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const bt = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return at === bt;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (a?._bsontype === 'ObjectId' || b?._bsontype === 'ObjectId') return String(a) === String(b);
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return txt(a) === txt(b);
};

const wsCsvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

const wsKey = (code, seedLine) => `${txt(code)}|${seedLine === undefined || seedLine === null ? '' : seedLine}`;

/* One pass over the workbook for the profile validation and the per-location
   breakdown. The row loop below still owns every skip decision; this is a
   report/validation view, not a second import path. */
function wsWorkbookStats(rows) {
  const stats = {
    rowsRead: rows.length,
    totalRows: 0,
    blankRows: 0,
    dataRows: 0,
    locations: new Map(),
    uom: new Map(),
    batch: new Map(),
    supplierCodes: new Set(),
    supplierNames: new Set(),
    groups: new Set(),
    distinctItemCodes: new Set(),
    blankSupplierCode: 0,
    blankItemCode: 0,
    invalidQty: 0,
    zeroQty: 0,
    negativeQty: 0,
    nonPositive: 0,
    sumQty: 0,
    totalQtyRow: 0,
    fractionalPc: 0,
    duplicates: new Map(),
    duplicateGroups: 0,
    duplicateExtraRows: 0,
    zeroQtyDuplicateGroups: 0,
    zeroQtyDuplicateRows: 0,
    zeroQtyDuplicateExtraRows: 0,
    zeroQtyDuplicateQty: 0,
  };

  for (let idx = 0; idx < rows.length; idx += 1) {
    const r = rows[idx];
    const excelRow = idx + 2;
    const locationName = txt(r['Location Name']);
    const code = txt(r['Item Code']);

    if (!locationName && !code) { stats.blankRows += 1; continue; }
    if (norm(locationName) === 'total') {
      stats.totalRows += 1;
      const totalQty = Number(String(r['Close Qty'] ?? '').replace(/,/g, ''));
      if (Number.isFinite(totalQty)) stats.totalQtyRow += totalQty;
      continue;
    }

    stats.dataRows += 1;
    const location = locationName || '(blank)';
    const qtyRaw = String(r['Close Qty'] ?? '').replace(/,/g, '').trim();
    const qtyNum = qtyRaw === '' ? 0 : Number(qtyRaw);
    const validQty = Number.isFinite(qtyNum);
    const uom = txt(r['UOM']);
    const batch = txt(r['Batch/Unique']);
    const supplierCode = txt(r['Supplier Code']);
    const supplierName = txt(r['Supplier Name']);

    const loc = stats.locations.get(location) || {
      rows: 0,
      qty: 0,
      nonPositive: 0,
      zeroQty: 0,
      negativeQty: 0,
      blankSupplier: 0,
      blankSupplierQty: 0,
    };
    loc.rows += 1;
    if (validQty) {
      loc.qty += qtyNum;
      if (qtyNum <= 0) loc.nonPositive += 1;
      if (qtyNum === 0) loc.zeroQty += 1;
      if (qtyNum < 0) loc.negativeQty += 1;
    }
    if (!supplierCode) {
      loc.blankSupplier += 1;
      if (validQty) loc.blankSupplierQty += qtyNum;
    }
    stats.locations.set(location, loc);

    const uomKey = uom || '(blank)';
    const u = stats.uom.get(uomKey) || { rows: 0, qty: 0 };
    u.rows += 1;
    if (validQty) u.qty += qtyNum;
    stats.uom.set(uomKey, u);

    const batchKey = batch || '(blank)';
    stats.batch.set(batchKey, (stats.batch.get(batchKey) || 0) + 1);

    if (supplierCode) stats.supplierCodes.add(supplierCode);
    else stats.blankSupplierCode += 1;
    if (supplierName) stats.supplierNames.add(supplierName);
    if (txt(r['Group Name'])) stats.groups.add(txt(r['Group Name']));
    if (code) stats.distinctItemCodes.add(code);
    else stats.blankItemCode += 1;

    if (!validQty) {
      stats.invalidQty += 1;
      continue;
    }
    stats.sumQty += qtyNum;
    if (qtyNum === 0) stats.zeroQty += 1;
    if (qtyNum < 0) stats.negativeQty += 1;
    if (qtyNum <= 0) stats.nonPositive += 1;
    if (code && uomTypeOf(uom) === 'PC' && !Number.isInteger(qtyNum)) stats.fractionalPc += 1;

    if (!code) continue;
    const key = `${code}\u0000${norm(location)}`;
    const d = stats.duplicates.get(key) || {
      code,
      location,
      count: 0,
      zeroCount: 0,
      firstExcelRow: excelRow,
      firstQty: qtyNum,
      firstBatch: batch,
    };
    d.count += 1;
    if (qtyNum === 0) d.zeroCount += 1;
    stats.duplicates.set(key, d);
  }

  for (const d of stats.duplicates.values()) {
    if (d.count <= 1) continue;
    stats.duplicateGroups += 1;
    stats.duplicateExtraRows += d.count - 1;
    if (d.zeroCount) {
      stats.zeroQtyDuplicateGroups += 1;
      stats.zeroQtyDuplicateRows += d.zeroCount;
      const nonZeroRows = d.count - d.zeroCount;
      /* The duplicate that would have been ignored: all zero rows when the
         group has a positive row, otherwise all but the first zero row. */
      stats.zeroQtyDuplicateExtraRows += Math.max(0, d.zeroCount - (nonZeroRows === 0 ? 1 : 0));
    }
  }

  return stats;
}

function wsValidateWorkbook(stats, expected) {
  const checks = [];
  const add = (field, exp, act, tolerance = 0) => {
    checks.push({
      field,
      expected: exp,
      actual: act,
      pass: typeof exp === 'number' && typeof act === 'number'
        ? Math.abs(exp - act) <= tolerance
        : String(exp) === String(act),
    });
  };

  if (!expected) return { pass: true, checks, mismatches: [] };
  if (expected.dataRows !== undefined) add('dataRows', expected.dataRows, stats.dataRows);
  if (expected.locations) {
    for (const [name, rows] of Object.entries(expected.locations)) {
      add(`location:${name}`, rows, stats.locations.get(name)?.rows || 0);
    }
  }
  if (expected.suppliers !== undefined) add('suppliers', expected.suppliers, stats.supplierCodes.size);
  if (expected.groups !== undefined) add('groups', expected.groups, stats.groups.size);
  if (expected.uom) {
    for (const [name, rows] of Object.entries(expected.uom)) add(`uom:${name}`, rows, stats.uom.get(name)?.rows || 0);
  }
  if (expected.batch) {
    for (const [name, rows] of Object.entries(expected.batch)) add(`batch:${name}`, rows, stats.batch.get(name) || 0);
  }
  if (expected.nonPositive !== undefined) add('nonPositive', expected.nonPositive, stats.nonPositive);
  if (expected.sumQty !== undefined) add('sumQty', expected.sumQty, stats.sumQty, 0.01);
  if (expected.duplicateExtraRows !== undefined) add('duplicateExtraRows', expected.duplicateExtraRows, stats.duplicateExtraRows);
  if (expected.blankSupplierCode !== undefined) add('blankSupplierCode', expected.blankSupplierCode, stats.blankSupplierCode);
  if (expected.fractionalPc !== undefined) add('fractionalPc', expected.fractionalPc, stats.fractionalPc);

  const mismatches = checks.filter((c) => !c.pass);
  return { pass: mismatches.length === 0, checks, mismatches };
}

/* Resolve the one companylocation that receives this profile's stock. */
async function wsResolveWarehouse(db, profile, overrideId) {
  const oid = new ObjectId(profile.businessId);
  const business = await db.collection('business').findOne({ _id: oid });
  if (!business) throw new Error(`Business ${profile.businessId} not found - aborting.`);

  const businessName = txt(business.name);
  const gstin = txt(business.gstin || business.gstNo);
  console.log(`🏢 Business: "${businessName}" (${profile.businessId}) GSTIN: ${gstin || '(blank)'}`);
  if (profile.businessName && norm(businessName) !== norm(profile.businessName)) {
    console.log(`⚠️  Business name "${businessName}" does not match profile name "${profile.businessName}".`);
  }
  if (profile.gstin && gstin && gstin.toUpperCase() !== profile.gstin.toUpperCase()) {
    console.log(`⚠️  GSTIN "${gstin}" does not match profile GSTIN "${profile.gstin}".`);
  }

  const candidates = await db.collection('companylocation').find({
    businessId: { $in: [profile.businessId, oid] },
  }).toArray();

  const printCandidates = () => {
    console.log('   Location candidates:');
    for (const c of candidates) {
      console.log(`     - ${String(c._id)}  ${txt(c.name)}  type=${txt(c.type || c.locationType) || '(blank)'}`);
    }
  };

  let warehouse = null;
  let resolution = '';
  if (overrideId) {
    let overrideOid;
    try {
      overrideOid = new ObjectId(overrideId);
    } catch {
      throw new Error(`--warehouse-id "${overrideId}" is not a valid ObjectId - aborting.`);
    }
    warehouse = candidates.find((c) => String(c._id) === String(overrideOid)) || null;
    if (!warehouse) {
      printCandidates();
      throw new Error(`--warehouse-id ${overrideId} is not a companylocation in business ${profile.businessId} - aborting.`);
    }
    resolution = '--warehouse-id';
  } else if (profile.warehouseId) {
    warehouse = candidates.find((c) => String(c._id) === String(profile.warehouseId)) || null;
    if (!warehouse) {
      printCandidates();
      throw new Error(`Profile-pinned warehouse ${profile.warehouseId} is not a companylocation in business ${profile.businessId} - aborting.`);
    }
    resolution = 'profile-pinned';
  } else if (candidates.length === 1) {
    [warehouse] = candidates;
    resolution = 'single-location-for-business';
  } else if (candidates.length === 0) {
    throw new Error(`No companylocation found for business ${profile.businessId} - aborting; no location was created.`);
  } else {
    printCandidates();
    throw new Error(`Business ${profile.businessId} has ${candidates.length} locations; pass --warehouse-id <id> to choose one - aborting.`);
  }

  if (String(warehouse.businessId) !== profile.businessId) {
    throw new Error(`Resolved warehouse ${warehouse._id} belongs to business ${warehouse.businessId}, not ${profile.businessId} - aborting.`);
  }
  if (profile.warehouseName && norm(warehouse.name) !== norm(profile.warehouseName)) {
    console.log(`⚠️  Resolved warehouse name is "${warehouse.name}", profile target label is "${profile.warehouseName}" - continuing with the _id.`);
  }

  console.log(`📍 Warehouse resolved (${resolution}): "${warehouse.name}" _id=${warehouse._id} businessId=${warehouse.businessId}`);
  return { business, businessName, gstin, warehouse, candidates, resolution };
}

/* Is a master collection scoped by businessId? One check per collection. */
async function wsMasterScope(db, collName, baseFilter, bizMatch) {
  const coll = db.collection(collName);
  const [total, withBiz, forBiz] = await Promise.all([
    coll.countDocuments(baseFilter),
    coll.countDocuments({ ...baseFilter, businessId: { $exists: true, $ne: null } }),
    coll.countDocuments({ ...baseFilter, businessId: { $in: bizMatch } }),
  ]);
  const scoped = total > 0 && withBiz === total;
  return {
    collection: collName,
    total,
    withBiz,
    forBiz,
    scoped,
    mode: total === 0 ? 'empty' : scoped ? 'business-scoped' : withBiz === 0 ? 'global' : 'mixed',
  };
}

async function runWarehouseStock() {
  console.time('warehouse-stock');

  const profileKey = String(wsArg('profile', WS_CONFIG.DEFAULT_PROFILE) || '').trim().toLowerCase();
  const profile = WS_PROFILES[profileKey];
  if (!profile) {
    throw new Error(`Unknown --profile "${profileKey}". Available: ${Object.keys(WS_PROFILES).join(', ')}`);
  }

  const fileArg = wsArg('file', null);
  if (!fileArg) throw new Error('Missing --file "path\\to\\item_stock_item_wise_summary.xlsx"');
  const file = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set - run with --env-file=.env');

  const apply = process.argv.includes('--confirm');
  const includeExtra = wsAllArgs('include');
  /* Backwards-compatible alias for the old Temple flag. */
  if (process.argv.includes('--include-jnr')) includeExtra.push('TEMPLE FABRIC JNR');
  const includeLocationNames = [...profile.includeLocationNames, ...includeExtra];
  const includeSet = new Set(includeLocationNames.map(norm));
  const includeZero = process.argv.includes('--include-zero');
  const skipZero = !includeZero && WS_CONFIG.SKIP_ZERO_QTY;
  const allowExisting = process.argv.includes('--allow-existing-barcodes');
  const allowWorkbookMismatch = process.argv.includes('--allow-workbook-mismatch');
  /* Explicit opt-in: seed unmatched item rows with itemId=null, using the
     workbook itemCode/itemName. Never creates an Item master. */
  const allowMissingItems = process.argv.includes('--allow-missing-items');
  /* Explicit opt-in: when the profile business has no Item master, allow an
     exact Item Name match against the other businesses' Item rows. The matched
     itemId is cross-business; no Item row is copied or created. */
  const allowCrossBusinessItems = process.argv.includes('--allow-cross-business-items');
  const finYear = wsArg('fin-year', wsArg('finYear', WS_CONFIG.FIN_YEAR));
  const source = wsArg('source', profile.source);
  const chunkSize = Math.max(1, Number(wsArg('chunk', WS_CONFIG.CHUNK)) || WS_CONFIG.CHUNK);
  const itemCodeMode = String(wsArg('item-code-mode', WS_CONFIG.ITEM_CODE_MODE)).toLowerCase() === 'master' ? 'master' : 'barcode';
  const batchUniqueCase = String(wsArg('batch-unique-case', WS_CONFIG.BATCH_UNIQUE_CASE)).toLowerCase() === 'lower' ? 'lower' : 'title';
  const warehouseOverride = wsArg('warehouse-id', null);

  /* The workbook's Age column is as-of its export date. The Temple file name
     carries YYYYMMDD; the new files do not, so fall back to the profile date. */
  const asOfMatch = path.basename(file).match(/(20\d{2})(\d{2})(\d{2})/);
  const asOfDate = asOfMatch
    ? new Date(Date.UTC(Number(asOfMatch[1]), Number(asOfMatch[2]) - 1, Number(asOfMatch[3])))
    : parseWorkbookDate(profile.asOfDate || WS_CONFIG.AS_OF_DATE) || new Date();

  console.log(`\n${'='.repeat(80)}`);
  console.log('WAREHOUSE STOCK SEED - ITEM WISE SUMMARY WORKBOOK');
  console.log('='.repeat(80));
  console.log(`Profile: ${profileKey}`);
  console.log(`Mode: ${apply ? '🔴 APPLY (WRITE)' : '🟡 DRY RUN (READ ONLY)'}`);
  console.log(`File: ${file}`);
  console.log(`Business: ${profile.businessId} (${profile.businessName})`);
  console.log(`Financial year: ${finYear}   Source: ${source}`);
  console.log(`Included Excel locations: ${includeLocationNames.join(', ')}`);
  console.log(`Extra --include locations: ${includeExtra.length ? includeExtra.join(', ') : '(none)'}`);
  console.log(`Zero qty: ${skipZero ? 'skipped' : 'included as SOLD'}`);
  console.log(`Missing item masters: ${allowMissingItems ? 'seed with itemId=null' : 'skip'}`);
  console.log(`Cross-business Item master: ${allowCrossBusinessItems ? 'ENABLED (exact name match)' : 'off'}`);
  console.log(`Stock age reference: ${asOfDate.toISOString().slice(0, 10)}`);
  console.log(`Chunk: ${chunkSize}`);
  console.log('='.repeat(80) + '\n');

  /* ---------- Read the workbook ---------- */
  /* Raw values + no preformatted cell text keep the parser well under the
     machine's commit limit; helpers below coerce each field. */
  const wb = XLSX.readFile(file, { dense: true, cellText: false });
  const sheetName = wb.Sheets['Item Wise Summary'] ? 'Item Wise Summary' : wb.SheetNames[0];
  const worksheet = wb.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet not found. Sheets: ${wb.SheetNames.join(', ')}`);
  const rows = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: '' });
  if (!rows.length) throw new Error(`No data rows in "${sheetName}"`);

  const headers = Object.keys(rows[0]);
  const required = [
    'Location Name', 'Group Name', 'Sub Group Name', 'Supplier Code', 'Supplier Name',
    'Date', 'Age', 'Purchase Date', 'Batch/Unique', 'Item Name', 'Print Description', 'Item Code',
    'Item Attributes', 'HSN', 'Purchase Rate', 'Discount', 'Final Net Rate', 'GST %',
    'RSP', 'RSP Offer Price', 'WSP', 'DP', 'Close Qty', 'UOM',
  ];
  const missingHeaders = required.filter((h) => !headers.includes(h));
  if (missingHeaders.length) throw new Error(`Missing columns: ${missingHeaders.join(', ')}`);

  const stats = wsWorkbookStats(rows);
  const validation = wsValidateWorkbook(stats, profile.expected);

  console.log(`📄 Sheet: ${sheetName}   rows read: ${rows.length}   data: ${stats.dataRows}   Total row: ${stats.totalRows}   columns: ${headers.length}\n`);

  if (profile.expected) {
    if (validation.pass) {
      console.log('✅ Workbook facts match the profile definition.');
    } else {
      console.log('⚠️  WORKBOOK FACT MISMATCH - this may be the wrong file for this profile:');
      for (const m of validation.mismatches) {
        console.log(`   ${m.field}: expected ${m.expected}, found ${m.actual}`);
      }
      if (apply && !allowWorkbookMismatch) {
        throw new Error('Workbook facts do not match the profile - refusing --confirm. Use --allow-workbook-mismatch only if you are certain.');
      }
    }
  }

  const locations = [...stats.locations.entries()].map(([name, s]) => ({
    name,
    rows: s.rows,
    qty: Number(s.qty.toFixed(3)),
    included: includeSet.has(norm(name)),
    nonPositive: s.nonPositive,
    zeroQty: s.zeroQty,
    negativeQty: s.negativeQty,
    blankSupplier: s.blankSupplier,
    blankSupplierQty: Number(s.blankSupplierQty.toFixed(3)),
  }));
  const otherLocation = {};
  for (const loc of locations) {
    if (!loc.included) otherLocation[loc.name] = { rows: loc.rows, qty: loc.qty };
  }
  const includedStatsQty = locations.filter((l) => l.included).reduce((n, l) => n + l.qty, 0);

  console.log('📍 Excel location breakdown:');
  for (const loc of locations) {
    const status = loc.included ? 'included' : 'other_location - skipped';
    console.log(`   ${loc.name}: ${loc.rows} rows, qty ${Number(loc.qty.toFixed(3))} [${status}]`);
  }
  console.log('');

  /* ---------- Connect and resolve the one warehouse ---------- */
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000,
  });
  const db = mongoose.connection.db;
  console.log('🔌 Connected to MongoDB');

  const resolved = await wsResolveWarehouse(db, profile, warehouseOverride);
  const { business, businessName, gstin, warehouse, candidates, resolution } = resolved;
  const bizStr = String(warehouse.businessId);
  const bizId = new ObjectId(bizStr);
  const bizMatch = [bizStr, bizId];

  /* ---------- Master scoping: one check per collection ---------- */
  const supplierCollName = contactCollection('Supplier');
  const supplierFilter = supplierCollName === 'contact' ? { contactKind: 'Supplier' } : {};

  const [itemScope, supplierScope, uomScope, groupScope, hsnScope, taxScope] = await Promise.all([
    wsMasterScope(db, 'item', {}, bizMatch),
    wsMasterScope(db, supplierCollName, supplierFilter, bizMatch),
    wsMasterScope(db, 'uom', {}, bizMatch),
    wsMasterScope(db, 'productgroup', {}, bizMatch),
    wsMasterScope(db, 'hsn', {}, bizMatch),
    wsMasterScope(db, 'tax', {}, bizMatch),
  ]);
  const masterScope = {
    item: itemScope,
    supplier: supplierScope,
    uom: uomScope,
    group: groupScope,
    hsn: hsnScope,
    tax: taxScope,
  };

  const scopedFilter = (scope, filter) => (scope.scoped ? { ...filter, businessId: { $in: bizMatch } } : filter);
  /* With --allow-cross-business-items, load every Item and every master it
     references so the cross-business itemId resolves to its real group/HSN/
     UOM. Suppliers stay business-scoped. */
  const crossFilter = () => (allowCrossBusinessItems ? {} : null);
  const [suppliers, items, groups, uoms, hsns, taxes] = await Promise.all([
    db.collection(supplierCollName).find(scopedFilter(supplierScope, supplierFilter)).toArray(),
    db.collection('item').find(crossFilter() || scopedFilter(itemScope, {})).toArray(),
    db.collection('productgroup').find(crossFilter() || scopedFilter(groupScope, {})).toArray(),
    db.collection('uom').find(crossFilter() || scopedFilter(uomScope, {})).toArray(),
    db.collection('hsn').find(crossFilter() || scopedFilter(hsnScope, {})).toArray(),
    db.collection('tax').find(crossFilter() || scopedFilter(taxScope, {})).toArray(),
  ]);
  const profileItemCount = items.filter((it) => String(it.businessId) === bizStr).length;

  const scopeLine = (label, scope) => {
    const suffix = scope.mode === 'business-scoped'
      ? `business-scoped, ${scope.forBiz} for this business / ${scope.total} total`
      : `${scope.mode}, ${scope.forBiz} for this business / ${scope.total} total`;
    console.log(`   ${label}: ${suffix}`);
  };
  console.log('\n🔐 Master scoping:');
  scopeLine('Item', itemScope);
  scopeLine(`Supplier (${supplierCollName})`, supplierScope);
  scopeLine('UOM', uomScope);
  scopeLine('Product group', groupScope);
  scopeLine('HSN', hsnScope);
  scopeLine('Tax', taxScope);

  const itemByCode = new Map();
  const itemByName = new Map();
  for (const item of items) {
    if (txt(item.itemCode)) itemByCode.set(norm(item.itemCode), item);
    const key = norm(item.name);
    if (!key) continue;
    if (!itemByName.has(key)) itemByName.set(key, []);
    itemByName.get(key).push(item);
  }

  const supByCode = new Map();
  const supByName = new Map();
  for (const sup of suppliers) {
    if (String(sup.businessId) !== bizStr) continue;
    const code = norm(sup.contactId);
    const name = norm(sup.businessName);
    if (code) supByCode.set(code, sup);
    if (name) supByName.set(name, sup);
  }

  const groupById = new Map(groups.map((g) => [String(g._id), g]));
  const groupByName = new Map();
  for (const group of groups) {
    if (allowCrossBusinessItems && String(group.businessId) !== bizStr) continue;
    if (txt(group.name)) groupByName.set(norm(group.name), group);
  }

  const uomById = new Map(uoms.map((u) => [String(u._id), u]));
  const uomByType = new Map();
  for (const uom of uoms) {
    if (allowCrossBusinessItems && String(uom.businessId) !== bizStr) continue;
    const type = uomTypeOf(`${txt(uom.name)} ${txt(uom.shortName)}`);
    if (!uomByType.has(type)) uomByType.set(type, uom);
  }

  const hsnById = new Map(hsns.map((h) => [String(h._id), h]));
  const taxById = new Map(taxes.map((t) => [String(t._id), t]));

  const masterGstOf = (item) => {
    const hsn = hsnById.get(String(item.hsnId));
    if (!hsn) return '';
    const slab = (hsn.taxSlabs || [])[0];
    const tax = slab ? taxById.get(String(slab.gstTaxNameId)) : null;
    return tax ? String(tax.igst) : '';
  };

  /* Images shipped with the repo; imageUrl is only written when a file exists. */
  const imageFiles = new Map();
  try {
    const dir = path.join(process.cwd(), 'public', 'august_8A_images');
    for (const file of fs.readdirSync(dir)) imageFiles.set(file.replace(/\.[^.]+$/, '').toUpperCase(), file);
  } catch { /* folder absent - no imageUrl is written */ }

  console.log(`\n⚡ Loaded: ${items.length} items (${profileItemCount} in this business), ${suppliers.length} suppliers, ${groups.length} groups, ${uoms.length} uoms, ${hsns.length} hsns, ${taxes.length} taxes\n`);

  /* ---------- Process rows ---------- */
  const skipped = {
    totalRow: 0,
    blankRow: 0,
    otherLocation: 0,
    blankItemCode: 0,
    zeroQty: 0,
    invalidQty: 0,
    fractionalPc: 0,
    unmatchedItem: 0,
    blankBatchType: 0,
    crossLocationConflict: 0,
    duplicateUnique: 0,
  };
  const skippedQty = {
    blankItemCode: 0,
    zeroQty: 0,
    invalidQty: 0,
    fractionalPc: 0,
    unmatchedItem: 0,
    blankBatchType: 0,
    crossLocationConflict: 0,
    duplicateUnique: 0,
  };

  const unmatchedItemRows = [];
  const unmatchedSupplierMap = new Map();
  const mismatchRows = [];
  const invalidRows = [];
  const duplicateRows = [];
  const planned = [];
  const matchedItemNames = new Set();
  const matchedItemCodes = new Set();
  const selectedItemCodes = new Set();
  const matchedSupplierIds = new Set();
  let inScope = 0;
  let selectedQty = 0;
  let selectedValue = 0;
  let matchedItemRows = 0;
  let crossBusinessItemRows = 0;
  const crossBusinessItemIds = new Set();
  const crossBusinessItemBusinesses = new Map();
  let matchedSupplierRows = 0;
  const now = new Date();

  /* Zero-qty rows are skipped before duplicate handling. Keep only the
     selected-location duplicate groups here; the report should not count
     duplicates in an Excel location that this profile skipped. */
  const zeroQtyDuplicateCsv = [];
  const zeroDupInfo = new Map();
  if (skipZero) {
    for (const [key, d] of stats.duplicates.entries()) {
      if (d.count <= 1 || !d.zeroCount) continue;
      if (!includeSet.has(norm(d.location))) continue;
      zeroDupInfo.set(key, d);
    }
  }
  let zeroQtyDuplicateGroups = 0;
  let zeroQtyDuplicateRows = 0;
  let zeroQtyDuplicateExtraRows = 0;
  for (const d of zeroDupInfo.values()) {
    zeroQtyDuplicateGroups += 1;
    zeroQtyDuplicateRows += d.zeroCount;
    const nonZeroRows = d.count - d.zeroCount;
    zeroQtyDuplicateExtraRows += Math.max(0, d.zeroCount - (nonZeroRows === 0 ? 1 : 0));
  }

  for (let idx = 0; idx < rows.length; idx += 1) {
    const r = rows[idx];
    const excelRow = idx + 2;
    const locationName = txt(r['Location Name']);
    const code = txt(r['Item Code']);
    const itemNameRaw = txt(r['Item Name']);
    const groupName = txt(r['Group Name']);
    const subGroupName = txt(r['Sub Group Name']);
    const uom = txt(r['UOM']);
    const purRateNum = wsPriceNum(r['Purchase Rate']);

    if (!locationName && !code) { skipped.blankRow += 1; continue; }
    if (norm(locationName) === 'total') { skipped.totalRow += 1; continue; }

    if (!includeSet.has(norm(locationName))) {
      skipped.otherLocation += 1;
      continue;
    }
    inScope += 1;

    const rawQty = String(r['Close Qty'] ?? '').replace(/,/g, '').trim();
    const qtyNum = rawQty === '' ? 0 : Number(rawQty);
    if (!Number.isFinite(qtyNum)) {
      skipped.invalidQty += 1;
      invalidRows.push([excelRow, code, 'Close Qty', rawQty, 'not a number', 'skipped']);
      continue;
    }
    selectedQty += qtyNum;
    selectedValue += qtyNum * purRateNum;

    if (code) selectedItemCodes.add(code);

    if (!code) {
      skipped.blankItemCode += 1;
      skippedQty.blankItemCode += qtyNum;
      invalidRows.push([excelRow, code, 'Item Code', '', 'blank barcode', 'skipped']);
      continue;
    }

    if (qtyNum < 0) {
      skipped.invalidQty += 1;
      skippedQty.invalidQty += qtyNum;
      invalidRows.push([excelRow, code, 'Close Qty', qtyNum, 'negative quantity', 'skipped']);
      continue;
    }

    if (skipZero && qtyNum <= 0) {
      skipped.zeroQty += 1;
      skippedQty.zeroQty += qtyNum;
      const zeroKey = `${code}\u0000${norm(locationName)}`;
      const zeroDup = qtyNum === 0 ? zeroDupInfo.get(zeroKey) : null;
      if (zeroDup) {
        zeroQtyDuplicateCsv.push([
          excelRow, code, txt(r['Batch/Unique']), 'zero-qty-ignored', qtyNum,
          zeroDup.firstExcelRow, zeroDup.firstQty,
          `qty 0 skipped before duplicate handling; group has ${zeroDup.count} row(s)`,
        ]);
      }
      continue;
    }

    if (uomTypeOf(uom) === 'PC' && !Number.isInteger(qtyNum)) {
      skipped.fractionalPc += 1;
      skippedQty.fractionalPc += qtyNum;
      invalidRows.push([excelRow, code, 'Close Qty', qtyNum, `fractional quantity for ${uom || 'Pc(s)'}`, 'skipped']);
      continue;
    }

    if (!uom) {
      invalidRows.push([excelRow, code, 'UOM', '', 'blank UOM - uomType falls back to PC', 'warn']);
    } else if (!uomByType.has(uomTypeOf(uom))) {
      invalidRows.push([excelRow, code, 'UOM', uom, `no ${uomTypeOf(uom)} UOM master in this business`, 'warn']);
    }

    /* 1. Supplier: code, then name, in this business only. This runs before
       item matching so a missing supplier is reported even when its item is
       also missing from this business's master. */
    const supplierCode = txt(r['Supplier Code']);
    const supplierName = txt(r['Supplier Name']);
    const supplier = supByCode.get(norm(supplierCode)) || supByName.get(norm(supplierName)) || null;
    if (supplier) {
      matchedSupplierRows += 1;
      matchedSupplierIds.add(String(supplier._id));
    } else {
      const key = `${norm(supplierCode)}|${norm(supplierName)}`;
      const rec = unmatchedSupplierMap.get(key) || {
        code: supplierCode,
        name: supplierName,
        rows: 0,
        qty: 0,
        value: 0,
        firstExcelRow: excelRow,
        lastExcelRow: excelRow,
        reason: !supplierCode
          ? 'blank_supplier_code'
          : 'supplier code/name not found in this business',
      };
      rec.rows += 1;
      rec.qty += qtyNum;
      rec.value += qtyNum * purRateNum;
      rec.lastExcelRow = excelRow;
      unmatchedSupplierMap.set(key, rec);
    }

    /* 2. Item: Item Code, then Item Name + Group/Sub Group. */
    let item = itemByCode.get(norm(code)) || null;
    let matchVia = item ? 'itemCode' : '';
    if (!item) {
      const candidatesForName = itemByName.get(norm(itemNameRaw)) || [];
      if (candidatesForName.length === 1) {
        [item] = candidatesForName;
        matchVia = 'itemName';
      } else if (candidatesForName.length > 1) {
        const exGroup = norm(groupName);
        const exSub = norm(subGroupName);
        const score = (candidate) => {
          const group = groupById.get(String(candidate.subGroupId));
          const gName = norm(group?.name);
          const pName = group?.parentId ? norm(groupById.get(String(group.parentId))?.name) : '';
          let value = 0;
          /* Exact spelling beats a case-only duplicate (e.g. 15-SA vs 15-Sa). */
          if (txt(candidate.name) === itemNameRaw) value += 8;
          if (txt(candidate.itemCode) === itemNameRaw) value += 4;
          if (gName === exGroup || pName === exGroup) value += 2;
          if (gName === exSub || pName === exSub) value += 1;
          return value;
        };
        item = [...candidatesForName].sort((a, b) => score(b) - score(a))[0];
        matchVia = 'itemName+group';
      }
    }

    if (!item) {
      if (!allowMissingItems) {
        skipped.unmatchedItem += 1;
        skippedQty.unmatchedItem += qtyNum;
        unmatchedItemRows.push([
          excelRow, code, itemNameRaw, groupName, subGroupName, qtyNum, Number((qtyNum * purRateNum).toFixed(2)),
          items.length === 0 ? 'no Item master in this business' : 'no Item master by code or name',
        ]);
        continue;
      }

      /* Explicit opt-in. Keep the workbook identity and leave itemId null;
         no Item master is created. Downstream item-wise joins will not find
         this row until an item master is linked later. */
      item = {
        _id: null,
        itemCode: code,
        name: itemNameRaw || code,
        subGroupId: null,
        hsnId: null,
        gstId: null,
        uomId: null,
        uniqueBarcode: '',
      };
      matchVia = itemNameRaw ? 'workbookItemName' : 'workbookItemCode';
      unmatchedItemRows.push([
        excelRow, code, itemNameRaw, groupName, subGroupName, qtyNum, Number((qtyNum * purRateNum).toFixed(2)),
        'no Item master; workbook itemCode/itemName retained with itemId=null',
      ]);
    } else {
      matchedItemRows += 1;
      matchedItemNames.add(norm(item.name));
      matchedItemCodes.add(norm(code));
    }

    const hasItemMaster = Boolean(item._id);
    const itemBusinessId = hasItemMaster ? String(item.businessId || '') : '';
    const crossBusinessItem = Boolean(itemBusinessId && itemBusinessId !== bizStr);
    if (crossBusinessItem) {
      crossBusinessItemRows += 1;
      crossBusinessItemIds.add(String(item._id));
      crossBusinessItemBusinesses.set(itemBusinessId, (crossBusinessItemBusinesses.get(itemBusinessId) || 0) + 1);
    }

    /* 3. Cross-check masters; the workbook wins for HSN/GST, the master for itemId/uomType. */
    const masterGroup = hasItemMaster ? groupById.get(String(item.subGroupId)) : null;
    const masterGroupName = txt(masterGroup?.name);
    const masterParentName = masterGroup?.parentId ? txt(groupById.get(String(masterGroup.parentId))?.name) : '';

    if (hasItemMaster && groupName && norm(masterGroupName) !== norm(groupName) && norm(masterParentName) !== norm(groupName)) {
      mismatchRows.push([excelRow, code, itemNameRaw, 'Group Name', masterGroupName || masterParentName, groupName, `item ${item.name}`]);
    }
    if (hasItemMaster && subGroupName && norm(masterGroupName) !== norm(subGroupName) && norm(masterParentName) !== norm(subGroupName)) {
      mismatchRows.push([excelRow, code, itemNameRaw, 'Sub Group Name', masterGroupName || masterParentName, subGroupName, `item ${item.name}`]);
    }

    const masterHsn = hasItemMaster ? txt(hsnById.get(String(item.hsnId))?.code) : '';
    const excelHsn = txt(r['HSN']);
    if (hasItemMaster && masterHsn && excelHsn && masterHsn !== excelHsn) {
      mismatchRows.push([excelRow, code, itemNameRaw, 'HSN', masterHsn, excelHsn, 'workbook value stored on the stock row']);
    }

    const masterGst = hasItemMaster ? masterGstOf(item) : '';
    const excelGst = wsPriceText(r['GST %']);
    if (hasItemMaster && masterGst !== '' && excelGst !== '' && Number(masterGst) !== wsPriceNum(excelGst)) {
      mismatchRows.push([excelRow, code, itemNameRaw, 'GST %', masterGst, excelGst, 'workbook value stored on the stock row']);
    }

    const itemUom = hasItemMaster && item.uomId ? uomById.get(String(item.uomId)) : null;
    const masterUomType = itemUom ? uomTypeOf(`${txt(itemUom.name)} ${txt(itemUom.shortName)}`) : '';
    const excelUomType = uomTypeOf(uom);
    if (hasItemMaster && masterUomType && masterUomType !== excelUomType) {
      mismatchRows.push([excelRow, code, itemNameRaw, 'UOM', `${masterUomType} (${itemUom.name})`, `${excelUomType} (${uom})`, 'master uomType wins']);
    }

    /* 4. Batch type: workbook, else the Item master. If the master has no
       value either, this row cannot be classified and is skipped. */
    const rawType = txt(r['Batch/Unique']).toLowerCase();
    let batchType;
    if (rawType === 'batch' || rawType === 'unique') {
      batchType = rawType;
    } else {
      const uniqueBarcode = txt(item.uniqueBarcode).toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(uniqueBarcode)) batchType = 'unique';
      else if (['no', 'n', 'false', '0'].includes(uniqueBarcode)) batchType = 'batch';
      else {
        skipped.blankBatchType += 1;
        skippedQty.blankBatchType += qtyNum;
        invalidRows.push([
          excelRow, code, 'Batch/Unique', txt(r['Batch/Unique']),
          'blank/unrecognised and Item master has no uniqueBarcode', 'skipped',
        ]);
        continue;
      }
      if (rawType) {
        invalidRows.push([excelRow, code, 'Batch/Unique', txt(r['Batch/Unique']), `unrecognised value - inherited ${batchType}`, 'warn']);
      }
    }
    if (batchType === 'unique' && qtyNum > 1) {
      invalidRows.push([excelRow, code, 'Close Qty', qtyNum, 'unique barcode with quantity > 1', 'warn']);
    }

    const attrs = parseAttributes(r['Item Attributes']);
    const printDescription = txt(r['Print Description']);
    const workbookDate = parseWorkbookDate(txt(r['Date'])) || parseWorkbookDate(txt(r['Purchase Date'])) || null;
    const ageRaw = txt(r['Age']);
    const ageParsed = ageRaw === '' ? null : Number(ageRaw.replace(/,/g, ''));
    const providedAge = Number.isFinite(ageParsed) ? ageParsed : null;
    const stockDate = workbookDate
      || (providedAge !== null ? new Date(asOfDate.getTime() - providedAge * 86400000) : null);
    const stockAge = providedAge !== null
      ? providedAge
      : (stockDate ? ageBetween(stockDate, asOfDate) : null);
    const createdAt = workbookDate || now;

    const groupDoc = groupByName.get(norm(groupName)) || masterGroup || null;
    const uomDoc = itemUom || uomByType.get(masterUomType || excelUomType) || null;
    const imageFile = imageFiles.get(code.toUpperCase());

    const customFields = {
      origins: [locationName],
      groupName,
      subGroupName,
      itemAttributes: txt(r['Item Attributes']),
      matchVia,
    };

    const doc = {
      barcodeNo: code,
      oldBarcode: code,
      barcodeGenerated: '',
      itemCode: itemCodeMode === 'master' ? (txt(item.itemCode) || txt(item.name) || code) : code,
      itemId: item._id,
      itemName: itemNameRaw || txt(item.name),
      groupId: groupDoc ? String(groupDoc._id) : '',
      printDescription,
      supplierDescription: attrs.supplierDescription,
      p_m_f: attrs.pmf,
      designNo: attrs.supplierDescription || printDescription || itemNameRaw,
      qty: String(qtyNum),
      qtyNum,
      uom,
      uomType: masterUomType || excelUomType,
      uomId: item.uomId || uomDoc?._id || null,
      hsn: excelHsn,
      gst: excelGst,
      purRate: wsPriceText(r['Purchase Rate']),
      disc: wsPriceText(r['Discount']),
      finalNet: wsPriceText(r['Final Net Rate']),
      retailPrice: wsPriceText(r['RSP']),
      offerPrice: wsPriceText(r['RSP Offer Price']),
      wspPrice: wsPriceText(r['WSP']),
      dpPrice: wsPriceText(r['DP']),
      batchType,
      batchUnique: batchUniqueCase === 'lower' ? batchType : (batchType === 'batch' ? 'Batch' : 'Unique'),
      batchNo: batchType === 'batch' ? code : '',
      status: qtyNum > 0 ? BARCODE_STATUS.IN_STOCK : BARCODE_STATUS.SOLD,
      currentLocationId: warehouse._id,
      currentBusinessId: bizId,
      locationId: String(warehouse._id),
      businessId: bizStr,
      finYear,
      stockDate,
      stockAge,
      source,
      supplierId: supplier ? String(supplier._id) : '',
      customFields,
      importedFrom: { file: path.basename(file), row: excelRow, sheet: sheetName },
      createdAt,
      updatedAt: createdAt,
    };
    if (imageFile) doc.imageUrl = `/august_8A_images/${imageFile}`;

    planned.push({
      row: excelRow,
      qty: qtyNum,
      doc,
      priceSig: WS_PRICE_FIELDS.map((field) => String(wsPriceNum(doc[field]))).join('|'),
    });
  }

  console.log(`🔄 Processed ${rows.length} rows: ${inScope} in scope, ${planned.length} matched ready for duplicate handling\n`);

  /* ---------- Duplicate key handling: barcodeNo + locationId ---------- */
  const byBarcode = new Map();
  for (const p of planned) {
    if (!byBarcode.has(p.doc.barcodeNo)) byBarcode.set(p.doc.barcodeNo, []);
    byBarcode.get(p.doc.barcodeNo).push(p);
  }

  let finalDocs = [];
  for (const [code, list] of byBarcode) {
    if (list.length === 1) { finalDocs.push(list[0]); continue; }

    const anyUnique = list.some((p) => p.doc.batchType === 'unique');
    const samePrices = list.every((p) => p.priceSig === list[0].priceSig);
    const rowList = list.map((p) => p.row).join('|');

    if (!anyUnique && samePrices) {
      /* Batch lots with identical prices are one stock position. */
      const base = list[0];
      const totalQty = list.reduce((n, p) => n + p.qty, 0);
      base.qty = totalQty;
      base.doc.qtyNum = totalQty;
      base.doc.qty = String(totalQty);
      base.doc.customFields.seedRows = list.map((p) => p.row);
      const dates = list.map((p) => p.doc.createdAt).filter(Boolean).map((d) => new Date(d).getTime());
      if (dates.length) {
        const first = new Date(Math.min(...dates));
        base.doc.createdAt = first;
        base.doc.updatedAt = first;
      }
      finalDocs.push(base);
      for (let i = 1; i < list.length; i += 1) {
        duplicateRows.push([list[i].row, code, 'batch', 'summed-into-first', list[i].qty, base.row, totalQty,
          `identical price fields; rows ${rowList}`]);
      }
    } else if (!anyUnique) {
      /* Different prices are different lots - keep every line. seedLine is the
         discriminator that keeps the upsert key unique across re-runs. */
      list.forEach((p, i) => {
        p.doc.customFields.seedLine = i + 1;
        p.doc.customFields.seedRows = [p.row];
        finalDocs.push(p);
        if (i > 0) {
          duplicateRows.push([p.row, code, 'batch', 'kept-separate', p.qty, list[0].row, list[0].qty,
            `price fields differ; rows ${rowList}`]);
        }
      });
    } else {
      /* A unique barcode is one physical unit; a second row is a conflict. */
      const base = list[0];
      base.doc.customFields.seedRows = list.map((p) => p.row);
      finalDocs.push(base);
      for (let i = 1; i < list.length; i += 1) {
        skipped.duplicateUnique += 1;
        skippedQty.duplicateUnique += list[i].qty;
        duplicateRows.push([list[i].row, code, 'unique', 'unique-kept-first', list[i].qty, base.row, base.qty,
          `unique barcode repeated; kept row ${base.row}`]);
      }
    }
  }

  /* ---------- Existing barcodes at the warehouse / elsewhere ---------- */
  const existingDocs = await db.collection('barcodeLabel').find({
    locationId: String(warehouse._id),
    source,
  }).toArray();
  const existingByKey = new Map();
  for (const doc of existingDocs) existingByKey.set(wsKey(doc.barcodeNo, doc.customFields?.seedLine), doc);

  const finalCodes = [...new Set(finalDocs.map((p) => p.doc.barcodeNo))];
  const finalCodeSet = new Set(finalCodes);
  const conflictsByCode = new Map();
  for (let i = 0; i < finalCodes.length; i += 1000) {
    const batch = finalCodes.slice(i, i + 1000);
    const found = await db.collection('barcodeLabel').find({
      businessId: { $in: bizMatch },
      $or: [{ barcodeNo: { $in: batch } }, { itemCode: { $in: batch } }],
    }, {
      projection: { barcodeNo: 1, itemCode: 1, locationId: 1, source: 1, status: 1, qtyNum: 1 },
    }).toArray();
    for (const doc of found) {
      /* Our own seeded rows are the upsert target, not a conflict. */
      if (String(doc.locationId) === String(warehouse._id) && txt(doc.source) === source) continue;
      for (const candidate of [txt(doc.barcodeNo), txt(doc.itemCode)]) {
        if (!candidate || !finalCodeSet.has(candidate)) continue;
        if (!conflictsByCode.has(candidate)) conflictsByCode.set(candidate, []);
        conflictsByCode.get(candidate).push(doc);
      }
    }
  }

  if (conflictsByCode.size && !allowExisting) {
    const kept = [];
    for (const p of finalDocs) {
      const conflicts = conflictsByCode.get(p.doc.barcodeNo) || [];
      if (conflicts.length) {
        skipped.crossLocationConflict += 1;
        skippedQty.crossLocationConflict += p.qty;
        const c = conflicts[0];
        duplicateRows.push([p.row, p.doc.barcodeNo, p.doc.batchType, 'cross-location-conflict', p.qty, '', '',
          `already exists as ${c.source} @ ${c.locationId} (${c.status}); use --allow-existing-barcodes to seed anyway`]);
      } else {
        kept.push(p);
      }
    }
    finalDocs = kept;
  }

  /* ---------- Totals and reconciliation ---------- */
  const seededQty = finalDocs.reduce((n, p) => n + Number(p.doc.qtyNum || 0), 0);
  const seededValue = finalDocs.reduce((n, p) => n + Number(p.doc.qtyNum || 0) * wsPriceNum(p.doc.purRate), 0);
  const noItemMasterDocs = finalDocs.filter((p) => !p.doc.itemId);
  const noItemMasterQty = noItemMasterDocs.reduce((n, p) => n + Number(p.doc.qtyNum || 0), 0);
  const noItemMasterValue = noItemMasterDocs.reduce((n, p) => n + Number(p.doc.qtyNum || 0) * wsPriceNum(p.doc.purRate), 0);
  const skippedQtyTotal = Object.values(skippedQty).reduce((n, v) => n + Number(v || 0), 0);
  const difference = selectedQty - (seededQty + skippedQtyTotal);
  const reconciled = Math.abs(difference) < 1e-6;
  if (Math.abs(selectedQty - includedStatsQty) > 0.01) {
    console.log(`⚠️  In-scope qty ${selectedQty} differs from workbook location total ${includedStatsQty}.`);
  }

  /* ---------- Planned insert / update counts (no writes yet) ---------- */
  const insertList = [];
  const updateList = [];
  let unchanged = 0;
  for (const p of finalDocs) {
    const existing = existingByKey.get(wsKey(p.doc.barcodeNo, p.doc.customFields?.seedLine));
    if (!existing) {
      insertList.push(p);
      continue;
    }
    const changed = {};
    for (const [field, value] of Object.entries(p.doc)) {
      if (field === '_id' || field === 'createdAt' || field === 'updatedAt') continue;
      if (!wsSame(existing[field], value)) changed[field] = value;
    }
    if (Object.keys(changed).length === 0) unchanged += 1;
    else updateList.push({ p, existing, changed });
  }

  /* ---------- Reports ---------- */
  const reportDir = path.resolve(process.cwd(), 'seed_reports', profileKey);
  fs.mkdirSync(reportDir, { recursive: true });

  const writeCsv = (name, header, data) => {
    const text = [header.join(','), ...data.map((r) => r.map(wsCsvCell).join(','))].join('\n');
    fs.writeFileSync(path.join(reportDir, name), text, 'utf8');
  };

  writeCsv('unmatched_items.csv',
    ['excelRow', 'itemCode', 'itemName', 'groupName', 'subGroupName', 'qty', 'value', 'reason'],
    unmatchedItemRows.map((r) => [r[0], r[1], r[2], r[3], r[4], Number(Number(r[5]).toFixed(3)), r[6], r[7]]));

  writeCsv('unmatched_suppliers.csv',
    ['supplierCode', 'supplierName', 'rows', 'qty', 'value', 'excelRow', 'lastExcelRow', 'reason'],
    [...unmatchedSupplierMap.values()].map((s) => [
      s.code, s.name, s.rows, Number(s.qty.toFixed(3)), Number(s.value.toFixed(2)), s.firstExcelRow, s.lastExcelRow, s.reason,
    ]));

  writeCsv('mismatch_report.csv',
    ['excelRow', 'itemCode', 'itemName', 'field', 'masterValue', 'excelValue', 'note'],
    mismatchRows);

  writeCsv('duplicate_conflicts.csv',
    ['excelRow', 'barcodeNo', 'batchType', 'action', 'rowQty', 'keptRow', 'keptQty', 'note'],
    [...duplicateRows, ...zeroQtyDuplicateCsv]
      .map((r) => [r[0], r[1], r[2], r[3], Number(Number(r[4]).toFixed(3)), r[5], r[6] === '' ? '' : Number(Number(r[6]).toFixed(3)), r[7]])
      .sort((a, b) => Number(a[0]) - Number(b[0])));

  writeCsv('invalid_rows.csv',
    ['excelRow', 'barcodeNo', 'field', 'value', 'reason', 'action'],
    invalidRows);

  const batchCount = finalDocs.filter((p) => p.doc.batchType === 'batch').length;
  const uniqueCount = finalDocs.filter((p) => p.doc.batchType === 'unique').length;
  const imageCount = finalDocs.filter((p) => p.doc.imageUrl).length;
  const stockDateCount = finalDocs.filter((p) => p.doc.stockDate).length;
  const stockAgeCount = finalDocs.filter((p) => p.doc.stockAge !== null && p.doc.stockAge !== undefined).length;
  const internalDuplicateRows = duplicateRows.filter((r) => r[3] !== 'cross-location-conflict').length;
  const conflictTotal = internalDuplicateRows + skipped.crossLocationConflict;
  const unmatchedItemCodes = new Set(unmatchedItemRows.map((r) => r[1]));
  const unmatchedSupplierRows = [...unmatchedSupplierMap.values()].reduce((n, s) => n + s.rows, 0);

  const zeroQtyDuplicates = {
    groups: zeroQtyDuplicateGroups,
    rows: zeroQtyDuplicateExtraRows,
    zeroRows: zeroQtyDuplicateRows,
    qty: 0,
  };

  console.log(`${'='.repeat(80)}`);
  console.log('SUMMARY (planned)');
  console.log('='.repeat(80));
  console.log(`Profile: ${profileKey}  (${profile.businessId})`);
  console.log(`Warehouse: ${warehouse.name} (${warehouse._id}) via ${resolution}`);
  console.log(`Rows read:                 ${rows.length} (data ${stats.dataRows}, Total ${stats.totalRows})`);
  console.log(`In scope:                  ${inScope}`);
  console.log(`Matched item rows:         ${matchedItemRows} (${matchedItemNames.size} distinct item names)`);
  console.log(`  cross-business itemId:   ${crossBusinessItemRows} rows (${crossBusinessItemIds.size} distinct item ids)`);
  console.log(`Seeded w/o item master:    ${noItemMasterDocs.length} (itemId=null, qty ${Number(noItemMasterQty.toFixed(3))})`);
  console.log(`Matched supplier rows:     ${matchedSupplierRows} (${matchedSupplierIds.size} distinct suppliers)`);
  console.log(`Docs planned:              ${finalDocs.length} (batch ${batchCount}, unique ${uniqueCount})`);
  console.log(`  with imageUrl:            ${imageCount}`);
  console.log(`  with stockDate:           ${stockDateCount}`);
  console.log(`  with stockAge:            ${stockAgeCount}`);
  console.log(`  new inserts:             ${insertList.length}`);
  console.log(`  updates:                 ${updateList.length}`);
  console.log(`  unchanged:               ${unchanged}`);
  console.log(`Total qty:                 ${Number(seededQty.toFixed(3))}`);
  console.log(`Total value (qty x purRate): ${seededValue.toFixed(2)}`);
  console.log('\nSkipped:');
  for (const [key, value] of Object.entries(skipped)) {
    if (!value) continue;
    console.log(`  ${key}: ${value} rows${skippedQty[key] !== undefined ? ` (qty ${Number(Number(skippedQty[key]).toFixed(3))})` : ''}`);
  }
  if (!Object.values(skipped).some(Boolean)) console.log('  (none)');
  if (Object.keys(otherLocation).length) {
    console.log('  other_location by Excel location:');
    for (const [name, s] of Object.entries(otherLocation)) {
      console.log(`    ${name}: ${s.rows} rows (qty ${Number(s.qty.toFixed(3))})`);
    }
  }

  console.log('\nCross-checks:');
  console.log(`  unmatched item masters:  ${unmatchedItemRows.length} rows (${unmatchedItemCodes.size} distinct codes); seeded with itemId=null: ${noItemMasterDocs.length}`);
  console.log(`  unmatched suppliers:    ${unmatchedSupplierMap.size} distinct (${unmatchedSupplierRows} rows)`);
  console.log(`  master mismatches:       ${mismatchRows.length} rows`);
  console.log(`  duplicate-key conflicts: ${internalDuplicateRows} rows`);
  console.log(`  cross-location conflicts:${skipped.crossLocationConflict} rows`);
  console.log(`  zero-qty duplicates:     ${zeroQtyDuplicates.rows} duplicate rows ignored in ${zeroQtyDuplicates.groups} groups (${zeroQtyDuplicates.zeroRows} zero-qty rows)`);
  console.log(`  invalid / flagged rows:  ${invalidRows.length} rows`);
  console.log(`  missing item codes (seedable): ${unmatchedItemCodes.size} distinct of ${selectedItemCodes.size} selected`);

  console.log(`\nReconciliation: workbook ${Number(selectedQty.toFixed(3))} = seeded ${Number(seededQty.toFixed(3))} + skipped ${Number(skippedQtyTotal.toFixed(3))} (difference ${Number(difference.toFixed(6))})`);
  console.log(reconciled ? '✅ PASS' : '❌ FAIL');

  /* Five full sample documents of each batch type. */
  for (const type of ['batch', 'unique']) {
    console.log(`\n--- 5 ${type} sample docs ---`);
    const samples = finalDocs.filter((p) => p.doc.batchType === type).slice(0, 5);
    if (!samples.length) console.log('(none)');
    for (const sample of samples) console.log(JSON.stringify(sample.doc, null, 2));
  }

  /* ---------- Apply ---------- */
  let inserted = 0;
  let updated = 0;
  const writeFailures = [];

  if (apply) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`WRITING ${insertList.length} inserts + ${updateList.length} updates in chunks of ${chunkSize}`);
    console.log('='.repeat(80));

    for (let i = 0; i < insertList.length; i += chunkSize) {
      const chunk = insertList.slice(i, i + chunkSize);
      for (const p of chunk) if (!p.doc._id) p.doc._id = new ObjectId();
      const ops = chunk.map((p) => {
        const { createdAt, _id, ...rest } = p.doc;
        return {
          updateOne: {
            filter: {
              barcodeNo: p.doc.barcodeNo,
              locationId: p.doc.locationId,
              source: p.doc.source,
              ...(p.doc.customFields?.seedLine !== undefined ? { 'customFields.seedLine': p.doc.customFields.seedLine } : {}),
            },
            update: { $set: rest, $setOnInsert: { _id, createdAt } },
            upsert: true,
          },
        };
      });

      try {
        await withTransaction(async (session) => {
          const res = await db.collection('barcodeLabel').bulkWrite(ops, { ordered: false, ...(session ? { session } : {}) });
          inserted += res.upsertedCount || Object.keys(res.upsertedIds || {}).length;
          const newDocs = [];
          for (const [opIndex, id] of Object.entries(res.upsertedIds || {})) {
            const p = chunk[Number(opIndex)];
            if (!p) continue;
            p.doc._id = id;
            if (p.doc.status === BARCODE_STATUS.IN_STOCK) newDocs.push(p.doc);
          }
          if (newDocs.length) {
            await applyMovement({
              units: newDocs,
              expect: null,
              set: {
                status: BARCODE_STATUS.IN_STOCK,
                currentLocationId: warehouse._id,
                currentBusinessId: bizId,
              },
              movement: {
                type: MOVEMENT_TYPES.GRC_IN,
                direction: 'in',
                toLocationId: warehouse._id,
                refModel: source,
                refNo: '',
                reason: 'Warehouse stock seed',
                finYear,
              },
              session,
            });

            /* applyMovement stamps updatedAt = now (it is the state-change
               writer). The seed spec wants the workbook's stock date on both
               timestamps, so put it back after the movement has been logged. */
            await db.collection('barcodeLabel').bulkWrite(
              newDocs.map((doc) => ({
                updateOne: { filter: { _id: doc._id }, update: { $set: { updatedAt: doc.updatedAt } } },
              })),
              { ordered: false, ...(session ? { session } : {}) },
            );
          }
        });
        console.log(`   inserts: ${Math.min(i + chunkSize, insertList.length)}/${insertList.length}`);
      } catch (err) {
        writeFailures.push({ phase: 'insert', at: i, error: err.message });
        console.error(`   ❌ insert chunk ${Math.floor(i / chunkSize) + 1} failed: ${err.message}`);
      }
    }

    for (let i = 0; i < updateList.length; i += chunkSize) {
      const chunk = updateList.slice(i, i + chunkSize);
      const ops = chunk.map(({ existing, changed }) => ({
        updateOne: { filter: { _id: existing._id }, update: { $set: { ...changed, updatedAt: new Date() } } },
      }));

      try {
        await withTransaction(async (session) => {
          const res = await db.collection('barcodeLabel').bulkWrite(ops, { ordered: false, ...(session ? { session } : {}) });
          updated += res.modifiedCount || 0;

          /* Keep the ledger tied when a re-run changes an existing quantity. */
          for (const { p, existing } of chunk) {
            const before = num(existing.qtyNum);
            const after = num(p.doc.qtyNum);
            if (before === after) continue;
            if (existing.status !== p.doc.status) {
              writeFailures.push({ phase: 'adjust', barcodeNo: p.doc.barcodeNo, error: `status changed ${existing.status} -> ${p.doc.status}; ledger adjustment skipped` });
              continue;
            }
            const delta = after - before;
            if (!delta) continue;
            await applyMovement({
              units: [{ ...p.doc, _id: existing._id, qtyNum: Math.abs(delta) }],
              expect: existing.status,
              set: {
                status: p.doc.status,
                currentLocationId: warehouse._id,
                currentBusinessId: bizId,
              },
              movement: {
                type: delta > 0 ? MOVEMENT_TYPES.ADJUST_IN : MOVEMENT_TYPES.ADJUST_OUT,
                direction: delta > 0 ? 'in' : 'out',
                ...(delta > 0 ? { toLocationId: warehouse._id } : { fromLocationId: warehouse._id }),
                refModel: source,
                refNo: '',
                reason: 'Warehouse stock seed quantity changed on re-run',
                finYear,
              },
              session,
            });
          }
        });
        console.log(`   updates: ${Math.min(i + chunkSize, updateList.length)}/${updateList.length}`);
      } catch (err) {
        writeFailures.push({ phase: 'update', at: i, error: err.message });
        console.error(`   ❌ update chunk ${Math.floor(i / chunkSize) + 1} failed: ${err.message}`);
      }
    }
  }

  /* ---------- Verify after write ---------- */
  let verification = null;
  if (apply) {
    const afterDocs = await db.collection('barcodeLabel').find({ source, locationId: String(warehouse._id) }).toArray();
    const afterQty = afterDocs.reduce((n, d) => n + Number(d.qtyNum || 0), 0);
    const keyCount = new Map();
    for (const d of afterDocs) {
      const key = wsKey(d.barcodeNo, d.customFields?.seedLine);
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    }
    const duplicateKeys = [...keyCount.entries()].filter(([, n]) => n > 1).length;
    const movementCount = await db.collection('stockmovement').countDocuments({ refModel: source });

    verification = {
      docs: afterDocs.length,
      totalQty: afterQty,
      duplicateUpsertKeys: duplicateKeys,
      stockMovements: movementCount,
      pass: afterDocs.length === finalDocs.length && Math.abs(afterQty - seededQty) < 1e-6 && duplicateKeys === 0,
    };
    console.log(`\n${'='.repeat(80)}`);
    console.log('VERIFICATION');
    console.log('='.repeat(80));
    console.log(`Docs at warehouse for source: ${verification.docs} (planned ${finalDocs.length})`);
    console.log(`Total qty in DB:              ${verification.totalQty} (planned ${seededQty})`);
    console.log(`Duplicate upsert keys:        ${verification.duplicateUpsertKeys}`);
    console.log(`Stock movements:              ${verification.stockMovements}`);
    console.log(verification.pass ? '✅ VERIFIED' : '❌ VERIFICATION FAILED');
  }

  /* ---------- seed_summary.json ---------- */
  const skippedQtyRounded = Object.fromEntries(
    Object.entries(skippedQty).map(([key, value]) => [key, Number(Number(value).toFixed(3))]),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'APPLY' : 'DRY_RUN',
    profile: {
      key: profileKey,
      businessId: profile.businessId,
      businessName,
      gstin,
      source,
      includeLocationNames,
      extraIncludeNames: includeExtra,
    },
    file: path.basename(file),
    sheet: sheetName,
    config: {
      DRY_RUN: !apply,
      SKIP_ZERO_QTY: skipZero,
      ALLOW_MISSING_ITEMS: allowMissingItems,
      ALLOW_CROSS_BUSINESS_ITEMS: allowCrossBusinessItems,
      FIN_YEAR: finYear,
      SOURCE: source,
      AS_OF_DATE: asOfDate.toISOString().slice(0, 10),
      BATCH_UNIQUE_CASE: batchUniqueCase,
      ITEM_CODE_MODE: itemCodeMode,
      CHUNK: chunkSize,
    },
    business: { _id: profile.businessId, name: businessName, gstin },
    warehouse: {
      _id: String(warehouse._id),
      name: warehouse.name,
      businessId: bizStr,
      resolution,
      candidates: candidates.map((c) => ({ _id: String(c._id), name: c.name, type: c.type || c.locationType || '' })),
    },
    rowsRead: rows.length,
    dataRows: stats.dataRows,
    totalRows: stats.totalRows,
    fileFacts: {
      distinctItemCodes: stats.distinctItemCodes.size,
      supplierCodes: stats.supplierCodes.size,
      supplierNames: stats.supplierNames.size,
      groups: stats.groups.size,
      blankSupplierCode: stats.blankSupplierCode,
      blankItemCode: stats.blankItemCode,
      invalidQty: stats.invalidQty,
      fractionalPc: stats.fractionalPc,
      nonPositive: stats.nonPositive,
      zeroQty: stats.zeroQty,
      negativeQty: stats.negativeQty,
      duplicateGroups: stats.duplicateGroups,
      duplicateExtraRows: stats.duplicateExtraRows,
      zeroQtyDuplicateRows: stats.zeroQtyDuplicateRows,
      uom: Object.fromEntries([...stats.uom.entries()].map(([key, value]) => [key, value.rows])),
      batch: Object.fromEntries(stats.batch.entries()),
    },
    locations,
    otherLocation,
    rowsInScope: inScope,
    matched: {
      itemRows: matchedItemRows,
      distinctItems: matchedItemNames.size,
      supplierRows: matchedSupplierRows,
      distinctSuppliers: matchedSupplierIds.size,
    },
    itemMaster: {
      businessItems: profileItemCount,
      itemsLoaded: items.length,
      crossBusinessItemsLoaded: items.length - profileItemCount,
      crossBusinessMatchedRows: crossBusinessItemRows,
      crossBusinessMatchedDistinct: crossBusinessItemIds.size,
      crossBusinessItemBusinesses: Object.fromEntries(crossBusinessItemBusinesses),
      itemsInSelectedRows: selectedItemCodes.size,
      distinctMatched: matchedItemCodes.size,
      distinctMissing: unmatchedItemCodes.size,
      seededWithoutItemId: noItemMasterDocs.length,
      seededWithoutItemIdQty: Number(noItemMasterQty.toFixed(3)),
      seededWithoutItemIdValue: Number(noItemMasterValue.toFixed(2)),
    },
    supplierMaster: {
      businessSuppliers: suppliers.length,
      distinctMatched: matchedSupplierIds.size,
    },
    planned: {
      docs: finalDocs.length,
      batch: batchCount,
      unique: uniqueCount,
      inserts: insertList.length,
      updates: updateList.length,
      unchanged,
    },
    applied: apply ? { inserted, updated, unchanged, failures: writeFailures.length } : null,
    inserted: apply ? inserted : 0,
    updated: apply ? updated : 0,
    skipped,
    skippedQty: skippedQtyRounded,
    skippedQtyTotal: Number(skippedQtyTotal.toFixed(3)),
    unmatched: {
      itemRows: unmatchedItemRows.length,
      itemGroups: unmatchedItemCodes.size,
      supplierRows: unmatchedSupplierRows,
      supplierGroups: unmatchedSupplierMap.size,
    },
    conflicts: conflictTotal,
    duplicateKeyConflicts: internalDuplicateRows,
    crossLocationConflicts: skipped.crossLocationConflict,
    zeroQtyDuplicates,
    invalidRows: invalidRows.length,
    mismatchRows: mismatchRows.length,
    totalQty: Number(seededQty.toFixed(3)),
    totalValue: Number(seededValue.toFixed(2)),
    selectedQty: Number(selectedQty.toFixed(3)),
    selectedValue: Number(selectedValue.toFixed(2)),
    images: imageCount,
    stockDates: stockDateCount,
    stockAges: stockAgeCount,
    masterScoping: masterScope,
    validation,
    reconciliation: {
      workbookQty: Number(selectedQty.toFixed(3)),
      seededQty: Number(seededQty.toFixed(3)),
      skippedQty: Number(skippedQtyTotal.toFixed(3)),
      difference: Number(difference.toFixed(6)),
      pass: reconciled,
    },
    verification,
    writeFailures,
  };
  fs.writeFileSync(path.join(reportDir, 'seed_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n📄 Reports in ${path.relative(process.cwd(), reportDir)}:`);
  for (const name of ['seed_summary.json', 'unmatched_items.csv', 'unmatched_suppliers.csv', 'mismatch_report.csv', 'duplicate_conflicts.csv', 'invalid_rows.csv']) {
    console.log(`   ${name}`);
  }

  if (!apply) {
    console.log('\n⚠️  DRY RUN - NO CHANGES MADE.');
    console.log('   Re-run with --confirm to write:');
    console.log(`   node scripts/seed-warehouse-stock.js --profile ${profileKey} --file "${fileArg}" --confirm`);
  } else if (writeFailures.length) {
    console.log(`\n⚠️  Completed with ${writeFailures.length} write failure(s) - inspect seed_summary.json.`);
  } else {
    console.log('\n✅ WAREHOUSE STOCK SEED COMPLETED');
  }

  console.timeEnd('warehouse-stock');
  await mongoose.disconnect();
}

/* ---------------------------------------------------------------------------
   ITEM-ID BACKFILL MODE

   Fixes barcodeLabel docs that were deliberately seeded with itemId=null.
   It ONLY sets itemId: no new docs, no stock movements, no batch/qty changes.
   Item matching is by exact Item Name (case-sensitive first), then normalized
   name, then Item Code. Multiple candidates are disambiguated by HSN; if still
   ambiguous the doc is reported and left untouched.

   The Item master is global in this mode because the related businesses share
   names. The matched item's businessId is reported, so a cross-business link is
   visible rather than silent.
--------------------------------------------------------------------------- */
async function runWarehouseItemIdBackfill() {
  console.time('item-id-backfill');
  const profileKey = String(wsArg('profile', WS_CONFIG.DEFAULT_PROFILE) || '').trim().toLowerCase();
  const profile = WS_PROFILES[profileKey];
  if (!profile) throw new Error(`Unknown --profile "${profileKey}". Available: ${Object.keys(WS_PROFILES).join(', ')}`);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set - run with --env-file=.env');

  const apply = process.argv.includes('--confirm');
  const source = wsArg('source', profile.source);
  const warehouseOverride = wsArg('warehouse-id', null);

  console.log(`\n${'='.repeat(80)}`);
  console.log('WAREHOUSE ITEM-ID BACKFILL');
  console.log('='.repeat(80));
  console.log(`Profile: ${profileKey}  (${profile.businessId})`);
  console.log(`Mode: ${apply ? '🔴 APPLY (WRITE)' : '🟡 DRY RUN (READ ONLY)'}`);
  console.log(`Source: ${source}`);
  console.log('Scope: itemId only — no inserts, no stock movements, no qty/batch changes');
  console.log('='.repeat(80) + '\n');

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000,
  });
  const db = mongoose.connection.db;
  console.log('🔌 Connected to MongoDB');

  const resolved = await wsResolveWarehouse(db, profile, warehouseOverride);
  const { warehouse, resolution } = resolved;
  const bizStr = String(warehouse.businessId);

  const [allItems, hsns] = await Promise.all([
    db.collection('item').find({}).toArray(),
    db.collection('hsn').find({}).toArray(),
  ]);
  const hsnCodeById = new Map(hsns.map((h) => [String(h._id), txt(h.code)]));

  const exactName = new Map();
  const normName = new Map();
  const exactCode = new Map();
  const normCode = new Map();
  const push = (map, key, item) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  };
  for (const item of allItems) {
    push(exactName, txt(item.name), item);
    push(normName, norm(item.name), item);
    push(exactCode, txt(item.itemCode), item);
    push(normCode, norm(item.itemCode), item);
  }

  const docs = await db.collection('barcodeLabel').find({
    locationId: String(warehouse._id),
    source,
  }).toArray();

  const pick = (list, doc) => {
    if (list.length === 1) return { item: list[0], via: '' };
    if (list.length > 1) {
      const hsn = txt(doc.hsn);
      if (hsn) {
        const byHsn = list.filter((it) => txt(hsnCodeById.get(String(it.hsnId))) === hsn);
        if (byHsn.length === 1) return { item: byHsn[0], via: 'hsn' };
      }
    }
    return { item: null, via: '' };
  };

  const updates = [];
  const issues = [];
  const byItem = new Map();
  let alreadyLinked = 0;
  let crossBusinessMatched = 0;

  for (const doc of docs) {
    if (doc.itemId) { alreadyLinked += 1; continue; }
    const itemName = txt(doc.itemName);
    const itemCode = txt(doc.itemCode);
    let chosen = null;
    let via = '';

    if (itemName) {
      let picked = pick(exactName.get(itemName) || [], doc);
      if (picked.item) { chosen = picked.item; via = picked.via ? `itemNameExact+${picked.via}` : 'itemNameExact'; }
      if (!chosen) {
        picked = pick(normName.get(norm(itemName)) || [], doc);
        if (picked.item) { chosen = picked.item; via = picked.via ? `itemName+${picked.via}` : 'itemName'; }
      }
    }
    if (!chosen && itemCode) {
      let picked = pick(exactCode.get(itemCode) || [], doc);
      if (picked.item) { chosen = picked.item; via = picked.via ? `itemCodeExact+${picked.via}` : 'itemCodeExact'; }
      if (!chosen) {
        picked = pick(normCode.get(norm(itemCode)) || [], doc);
        if (picked.item) { chosen = picked.item; via = picked.via ? `itemCode+${picked.via}` : 'itemCode'; }
      }
    }

    if (!chosen) {
      const candidates = [
        ...(exactName.get(itemName) || []),
        ...(normName.get(norm(itemName)) || []),
        ...(exactCode.get(itemCode) || []),
        ...(normCode.get(norm(itemCode)) || []),
      ].filter((v, i, a) => a.findIndex((x) => String(x._id) === String(v._id)) === i);
      issues.push({
        _id: String(doc._id),
        barcodeNo: doc.barcodeNo,
        itemCode: doc.itemCode,
        itemName: doc.itemName,
        reason: candidates.length ? 'ambiguous' : 'unmatched',
        candidates: candidates.map((it) => ({
          itemId: String(it._id),
          itemCode: it.itemCode,
          name: it.name,
          businessId: String(it.businessId || ''),
        })),
      });
      continue;
    }

    const itemBusinessId = String(chosen.businessId || '');
    const crossBusiness = Boolean(itemBusinessId && itemBusinessId !== bizStr);
    if (crossBusiness) crossBusinessMatched += 1;

    updates.push({ docId: doc._id, itemId: chosen._id, via, crossBusiness });
    const key = String(chosen._id);
    const rec = byItem.get(key) || {
      itemId: key,
      itemCode: txt(chosen.itemCode),
      itemName: txt(chosen.name),
      businessId: itemBusinessId,
      crossBusiness,
      docs: 0,
      qty: 0,
    };
    rec.docs += 1;
    rec.qty += Number(doc.qtyNum || 0);
    byItem.set(key, rec);
  }

  const ambiguous = issues.filter((i) => i.reason === 'ambiguous').length;
  const unmatched = issues.filter((i) => i.reason === 'unmatched').length;
  console.log(`Warehouse: ${warehouse.name} (${warehouse._id}) via ${resolution}`);
  console.log(`Docs at warehouse/source:  ${docs.length}`);
  console.log(`Already linked:            ${alreadyLinked}`);
  console.log(`Matched for itemId:        ${updates.length}`);
  console.log(`  cross-business itemId:   ${crossBusinessMatched}`);
  console.log(`Ambiguous (left null):     ${ambiguous}`);
  console.log(`Unmatched (left null):     ${unmatched}`);

  let applied = null;
  if (apply && updates.length) {
    const chunkSize = Math.max(1, Number(wsArg('chunk', WS_CONFIG.CHUNK)) || WS_CONFIG.CHUNK);
    let matchedCount = 0;
    let modifiedCount = 0;
    const failures = [];
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      try {
        const res = await db.collection('barcodeLabel').bulkWrite(
          chunk.map((u) => ({
            updateOne: {
              filter: { _id: u.docId, source, locationId: String(warehouse._id) },
              update: { $set: { itemId: u.itemId } },
            },
          })),
          { ordered: false },
        );
        matchedCount += res.matchedCount || 0;
        modifiedCount += res.modifiedCount || 0;
      } catch (err) {
        failures.push({ at: i, error: err.message });
      }
      console.log(`   itemId: ${Math.min(i + chunkSize, updates.length)}/${updates.length}`);
    }
    applied = { matched: matchedCount, modified: modifiedCount, failures: failures.length };
  }

  const finalDocs = await db.collection('barcodeLabel').find({
    locationId: String(warehouse._id),
    source,
  }).toArray();
  const itemIds = new Set(allItems.map((it) => String(it._id)));
  const itemIdNull = finalDocs.filter((d) => !d.itemId).length;
  const missingItemRows = finalDocs.filter((d) => d.itemId && !itemIds.has(String(d.itemId))).length;
  const wrongLocation = finalDocs.filter((d) => String(d.locationId) !== String(warehouse._id)).length;
  const wrongBusiness = finalDocs.filter((d) => String(d.businessId) !== bizStr).length;
  const crossBusinessDocs = finalDocs.filter((d) => {
    if (!d.itemId) return false;
    const it = allItems.find((x) => String(x._id) === String(d.itemId));
    return it && String(it.businessId || '') !== bizStr;
  }).length;
  const verification = {
    docs: finalDocs.length,
    itemIdNull,
    itemIdsNotInMaster: missingItemRows,
    crossBusinessDocs,
    wrongLocation,
    wrongBusiness,
    pass: itemIdNull === 0 && missingItemRows === 0 && wrongLocation === 0 && wrongBusiness === 0,
  };

  const reportDir = path.resolve(process.cwd(), 'seed_reports', profileKey);
  fs.mkdirSync(reportDir, { recursive: true });
  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    profile: profileKey,
    businessId: bizStr,
    source,
    warehouse: { _id: String(warehouse._id), name: warehouse.name, resolution },
    generatedAt: new Date().toISOString(),
    docs: docs.length,
    alreadyLinked,
    matched: updates.length,
    crossBusinessMatched,
    ambiguous,
    unmatched,
    byItem: [...byItem.values()].sort((a, b) => b.docs - a.docs),
    issues,
    applied,
    verification,
  };
  fs.writeFileSync(path.join(reportDir, 'item_id_backfill.json'), JSON.stringify(summary, null, 2), 'utf8');
  const csv = [
    ['_id', 'barcodeNo', 'itemCode', 'itemName', 'reason', 'candidates'].join(','),
    ...issues.map((i) => [i._id, i.barcodeNo, i.itemCode, i.itemName, i.reason, JSON.stringify(i.candidates)].map(wsCsvCell).join(',')),
  ].join('\n');
  fs.writeFileSync(path.join(reportDir, 'item_id_backfill_unmatched.csv'), csv, 'utf8');

  if (apply) {
    if (verification.pass) console.log('\n✅ ITEM-ID BACKFILL VERIFIED');
    else console.log('\n⚠️  ITEM-ID BACKFILL VERIFICATION HAS REMAINING ISSUES');
  } else {
    console.log('\n⚠️  DRY RUN - NO CHANGES MADE. Re-run with --confirm to write.');
  }
  console.log(`📄 Reports in ${path.relative(process.cwd(), reportDir)}: item_id_backfill.json, item_id_backfill_unmatched.csv`);
  console.log(`   itemId null: ${itemIdNull}; cross-business item ids: ${crossBusinessDocs}; wrong location/business: ${wrongLocation}/${wrongBusiness}`);

  console.timeEnd('item-id-backfill');
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

/* The warehouse-stock workbook is a separate entry mode of this same script:
   it reuses the connection, helpers, BarcodeLabel model and applyMovement
   ledger writer above. The thin launcher scripts/seed-warehouse-stock.js
   passes --warehouse-stock and the user's flags through. */
const run = process.argv.includes('--warehouse-stock')
  ? (process.argv.includes('--backfill-item-ids') ? runWarehouseItemIdBackfill : runWarehouseStock)
  : main;

run().catch(async (err) => {
  console.error('\n❌ FAILED:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
