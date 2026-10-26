/* ==========================================================================
   ITEM WISE SUMMARY IMPORT - server side.

   Loads the masters and existing barcode rows once per analysis, hands them to
   lib/itemWiseSummaryImport.js, and writes the approved result with the same
   models and inventory ledger the rest of the ERP uses.

   Nothing is written during analysis. Execution re-parses the stored upload,
   re-resolves the masters, creates only the masters the operator approved, and
   reports the database's own counts - never a frontend assumption.
   ========================================================================== */

import crypto from 'crypto';
import mongoose from 'mongoose';
import CompanyLocation from '@/models/CompanyLocation';
import ProductGroup from '@/models/ProductGroup';
import Item from '@/models/Item';
import Uom from '@/models/Uom';
import Hsn from '@/models/Hsn';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import { Supplier } from '@/lib/contacts';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { withTransaction } from '@/lib/inventory';
import {
  readWorkbook,
  buildMasterLookup,
  analyzeParsedWorkbook,
  normalizeApprovals,
  normalizeUom,
  uomTypeOf,
  compactKey,
  normalizeKey,
} from '@/lib/itemWiseSummaryImport';
import {
  STRATEGIES,
  MASTER_TYPES,
  CREATABLE_MASTERS,
  IMPORT_SOURCE,
} from '@/lib/itemWiseSummaryConstants';

const MAX_ERRORS = 200;
export const MAX_CLIENT_ANALYSIS_ROWS = 60000;

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function toObjectId(value) {
  if (!value) return null;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function numberText(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '';
}

function parseAttributes(value) {
  const out = { supplierDescription: '', pmf: '' };
  String(value || '').split('|').forEach((part) => {
    const match = part.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim().toLowerCase();
    if (key === 'supplier description') out.supplierDescription = match[2].trim();
    else if (key === 'p-m-f') out.pmf = match[2].trim();
  });
  return out;
}

/* --------------------------------------------------------------- masters -- */

export async function loadMasterData(businessId) {
  const business = toObjectId(businessId);
  if (!business) throw new Error('A valid business is required.');

  const [locations, groups, suppliers, items, uoms, hsns] = await Promise.all([
    CompanyLocation.find({ businessId: business }).select('_id name').lean(),
    ProductGroup.find({ businessId: business }).select('_id name parentId').lean(),
    Supplier.find({ businessId: business }).select('_id businessName shortName contactId').lean(),
    Item.find({ businessId: business }).select('_id name itemCode uomId hsnId subGroupId uniqueBarcode').lean(),
    Uom.find({ businessId: business }).select('_id name shortName allowDecimal').lean(),
    Hsn.find({ businessId: business }).select('_id code').lean(),
  ]);

  return {
    locations: locations.map((row) => ({ ...row, _id: String(row._id) })),
    groups: groups.map((row) => ({ ...row, _id: String(row._id), parentId: row.parentId ? String(row.parentId) : null })),
    suppliers: suppliers.map((row) => ({ ...row, _id: String(row._id) })),
    items: items.map((row) => ({
      ...row,
      _id: String(row._id),
      uomId: row.uomId ? String(row.uomId) : null,
      hsnId: row.hsnId ? String(row.hsnId) : null,
      subGroupId: row.subGroupId ? String(row.subGroupId) : null,
    })),
    uoms: uoms.map((row) => ({ ...row, _id: String(row._id) })),
    hsns: hsns.map((row) => ({ ...row, _id: String(row._id) })),
  };
}

/* Existing barcode rows for a set of effective barcode values, indexed both by
   their own barcode number and by item code (the Item Wise Summary export has
   no barcode column, so the Item Code is the key there). */
export async function loadExistingBarcodes(businessId, codes, locationNameById = new Map()) {
  const unique = [...new Set(codes.filter(Boolean))];
  const rows = [];
  for (const part of chunk(unique, 800)) {
    const found = await BarcodeLabel.find({
      businessId: String(businessId),
      $or: [{ barcodeNo: { $in: part } }, { itemCode: { $in: part } }],
    }).select('_id barcodeNo itemCode locationId qtyNum status customFields openingQty').lean();
    rows.push(...found);
  }

  const byBarcode = new Map();
  const byItemCode = new Map();
  rows.forEach((doc) => {
    const entry = {
      id: String(doc._id),
      barcodeNo: doc.barcodeNo || '',
      itemCode: doc.itemCode || '',
      locationId: String(doc.locationId || ''),
      locationName: locationNameById.get(String(doc.locationId || '')) || '',
      qtyNum: Number(doc.qtyNum) || 0,
      status: doc.status || '',
      customFields: doc.customFields || {},
      openingQty: Number(doc.openingQty) || 0,
    };
    /* Same key the analysis looks a barcode up with (normalizeKey - case and
       surrounding space only). A hyphenated or slashed barcode has to match
       itself, not a punctuation-stripped version of itself. */
    const barcodeKey = normalizeKey(doc.barcodeNo || '');
    if (barcodeKey) {
      if (!byBarcode.has(barcodeKey)) byBarcode.set(barcodeKey, []);
      byBarcode.get(barcodeKey).push(entry);
    }
    const itemKey = compactKey(doc.itemCode || '');
    if (itemKey) {
      if (!byItemCode.has(itemKey)) byItemCode.set(itemKey, []);
      byItemCode.get(itemKey).push(entry);
    }
  });

  return { byBarcode, byItemCode, total: rows.length };
}

function existingCodes(parsed, existing) {
  const codes = [];
  parsed.rows.forEach(({ values }) => {
    codes.push(String(values.barcode || '').trim() || String(values.itemCode || '').trim());
  });
  return codes;
}

export async function analyzeBuffer({
  buffer,
  fileName = '',
  businessId,
  finYear = '',
  strategy = STRATEGIES.CREATE,
  approvals = {},
  locationAllowed = null,
}) {
  const parsed = readWorkbook(buffer);
  const masters = await loadMasterData(businessId);
  const lookup = buildMasterLookup(masters);
  const locationNameById = new Map(masters.locations.map((row) => [String(row._id), row.name]));
  const existing = await loadExistingBarcodes(businessId, existingCodes(parsed, null), locationNameById);
  const normalized = normalizeApprovals(approvals);

  const analysis = analyzeParsedWorkbook({
    parsed,
    lookup,
    existing,
    strategy,
    approvals: normalized,
    locationAllowed,
  });

  return {
    parsed,
    masters,
    lookup,
    existing,
    analysis,
    fileHash: sha256(buffer),
    fileName,
    finYear,
    strategy,
  };
}

/* ------------------------------------------------------- create masters -- */

function p(name) {
  return String(name || '').trim();
}

export async function createApprovedMasters({
  analysis,
  lookup,
  businessId,
  userId = '',
}) {
  const business = toObjectId(businessId);
  const created = [];
  const failures = [];
  const entries = analysis.missingMasters
    .filter((entry) => entry.approved && CREATABLE_MASTERS.has(entry.type))
    .sort((a, b) => {
      const order = {
        [MASTER_TYPES.GROUP]: 1,
        [MASTER_TYPES.SUB_GROUP]: 2,
        [MASTER_TYPES.UOM]: 3,
        [MASTER_TYPES.HSN]: 4,
        [MASTER_TYPES.SUPPLIER]: 5,
        [MASTER_TYPES.ITEM]: 6,
      };
      return (order[a.type] || 9) - (order[b.type] || 9);
    });

  for (const entry of entries) {
    try {
      let doc = null;
      if (entry.type === MASTER_TYPES.GROUP) {
        if (!lookup.groupByName.has(normalizeKey(entry.value))) {
          doc = await ProductGroup.create({ businessId: business, name: p(entry.value) });
          const plain = { _id: String(doc._id), name: doc.name, parentId: null };
          lookup.groupById.set(String(doc._id), plain);
          lookup.groupByName.set(normalizeKey(doc.name), plain);
        }
      } else if (entry.type === MASTER_TYPES.SUB_GROUP) {
        if (!lookup.groupByName.has(normalizeKey(entry.value))) {
          const parent = entry.parent ? lookup.groupByName.get(normalizeKey(entry.parent)) : null;
          doc = await ProductGroup.create({
            businessId: business,
            name: p(entry.value),
            parentId: parent ? toObjectId(parent._id) : null,
          });
          const plain = { _id: String(doc._id), name: doc.name, parentId: parent ? String(parent._id) : null };
          lookup.groupById.set(String(doc._id), plain);
          lookup.groupByName.set(normalizeKey(doc.name), plain);
        }
      } else if (entry.type === MASTER_TYPES.UOM) {
        const key = compactKey(normalizeUom(entry.value));
        if (!lookup.uomByKey.has(key)) {
          doc = await Uom.create({
            businessId: business,
            name: p(entry.value),
            shortName: normalizeUom(entry.value),
            allowDecimal: uomTypeOf(entry.value) === 'MTR' ? 'Yes' : 'No',
          });
          const plain = { _id: String(doc._id), name: doc.name, shortName: doc.shortName };
          lookup.uomByKey.set(key, plain);
          lookup.uomById.set(String(doc._id), plain);
        }
      } else if (entry.type === MASTER_TYPES.HSN) {
        if (!lookup.hsnByCode.has(p(entry.value))) {
          doc = await Hsn.create({ businessId: business, code: p(entry.value), status: 'Active' });
          const plain = { _id: String(doc._id), code: doc.code };
          lookup.hsnByCode.set(p(doc.code), plain);
          lookup.hsnById.set(String(doc._id), plain);
        }
      } else if (entry.type === MASTER_TYPES.SUPPLIER) {
        const code = p(entry.code);
        const name = p(entry.name) || p(entry.value);
        const existing = (code && lookup.supplierByCode.get(compactKey(code)))
          || (name && lookup.supplierByName.get(normalizeKey(name)));
        if (!existing && name) {
          doc = await Supplier.create({
            businessId: business,
            businessName: name,
            contactId: code,
            shortName: '',
          });
          const plain = { _id: String(doc._id), businessName: doc.businessName, contactId: doc.contactId, shortName: doc.shortName };
          if (plain.contactId) lookup.supplierByCode.set(compactKey(plain.contactId), plain);
          lookup.supplierByName.set(normalizeKey(plain.businessName), plain);
        }
      } else if (entry.type === MASTER_TYPES.ITEM) {
        const code = p(entry.value);
        if (!lookup.itemByCode.has(compactKey(code))) {
          const uom = entry.uom ? lookup.uomByKey.get(compactKey(normalizeUom(entry.uom))) : null;
          const hsn = entry.hsn ? lookup.hsnByCode.get(p(entry.hsn)) : null;
          const subGroup = entry.subGroup ? lookup.groupByName.get(normalizeKey(entry.subGroup)) : null;
          if (entry.uom && !uom) throw new Error(`UOM "${entry.uom}" is not a master; approve the UOM first.`);
          if (entry.hsn && !hsn) throw new Error(`HSN "${entry.hsn}" is not a master; approve the HSN first.`);
          doc = await Item.create({
            businessId: business,
            name: p(entry.name) || code,
            itemCode: code,
            uomId: uom ? toObjectId(uom._id) : null,
            hsnId: hsn ? toObjectId(hsn._id) : null,
            subGroupId: subGroup ? toObjectId(subGroup._id) : null,
            uniqueBarcode: 'No',
          });
          const plain = {
            _id: String(doc._id),
            name: doc.name,
            itemCode: doc.itemCode,
            uomId: doc.uomId ? String(doc.uomId) : null,
            hsnId: doc.hsnId ? String(doc.hsnId) : null,
            subGroupId: doc.subGroupId ? String(doc.subGroupId) : null,
            uniqueBarcode: doc.uniqueBarcode,
          };
          lookup.itemByCode.set(compactKey(code), plain);
          lookup.itemById.set(String(doc._id), plain);
          if (!lookup.itemByName.has(normalizeKey(doc.name))) lookup.itemByName.set(normalizeKey(doc.name), []);
          lookup.itemByName.get(normalizeKey(doc.name)).push(plain);
        }
      }

      if (doc) {
        created.push({ type: entry.type, value: entry.value, name: doc.name || doc.businessName || doc.code || doc.shortName || entry.value, id: String(doc._id) });
      }
    } catch (error) {
      failures.push({
        type: entry.type,
        value: entry.value,
        message: error.message,
        code: error.code === 11000 ? 'DUPLICATE' : 'CREATE_FAILED',
      });
    }
  }

  return { created, failures };
}

/* ----------------------------------------------------------- execution --- */

function barcodeDoc(row, { businessId, finYear, fileName, sheetName }) {
  const values = row.values || {};
  const resolved = row.resolved || {};
  const attrs = parseAttributes(values.itemAttributes);
  const batchType = row.batchType || (row.qty > 1 ? 'batch' : 'unique');
  const stockDate = row.stockDateValue || null;

  return {
    barcodeNo: row.barcode,
    oldBarcode: '',
    barcodeGenerated: '',
    itemCode: resolved.itemCode || row.itemCode,
    itemId: toObjectId(resolved.itemId),
    itemName: resolved.itemName || row.itemName,
    groupId: resolved.groupId || '',
    supplierId: resolved.supplierId || '',
    printDescription: values.printDescription || '',
    supplierDescription: attrs.supplierDescription,
    p_m_f: attrs.pmf,
    designNo: attrs.supplierDescription || values.printDescription || row.itemName,
    uom: resolved.uom || row.uom,
    uomType: resolved.uomType || uomTypeOf(row.uom),
    uomId: toObjectId(resolved.uomId),
    hsn: resolved.hsn || values.hsn || '',
    gst: numberText(values.gst),
    purRate: numberText(values.purRate),
    disc: numberText(values.discount),
    finalNet: numberText(values.finalNet),
    retailPrice: numberText(values.rsp),
    disc2: numberText(values.discountPercent),
    offerPrice: numberText(values.offerPrice),
    wspPrice: numberText(values.wsp),
    dpPrice: numberText(values.dp),
    qty: String(row.qty),
    qtyNum: Number(row.qty),
    openingQty: row.openQty === null || row.openQty === undefined ? 0 : Number(row.openQty),
    hsrPurPrice: Number(values.purRate) || 0,
    batchType,
    batchUnique: batchType === 'batch' ? 'Batch' : 'Unique',
    batchNo: batchType === 'batch' ? row.barcode : '',
    stockDate,
    stockAge: row.stockAge === undefined ? null : row.stockAge,
    grcNo: values.grcNo || '',
    status: BARCODE_STATUS.IN_STOCK,
    currentLocationId: toObjectId(row.locationId),
    currentBusinessId: toObjectId(businessId),
    currentStockPointId: null,
    locationId: String(row.locationId),
    businessId: String(businessId),
    finYear,
    source: IMPORT_SOURCE,
    customFields: {
      origins: [row.locationName],
      groupName: values.groupName || '',
      subGroupName: values.subGroupName || '',
      itemAttributes: values.itemAttributes || '',
      supplierInvoiceNo: values.supplierInvoiceNo || '',
      purchaseDate: row.purchaseDate || '',
      itemWiseRow: row.row,
      itemWiseSheet: sheetName || 'Item Wise Summary',
      itemWiseFile: fileName || '',
      stockSummary: {
        openQty: row.openQty, openValue: row.openValue,
        inwardQty: row.inwardQty, inwardValue: row.inwardValue,
        outwardQty: row.outwardQty, outwardValue: row.outwardValue,
        closeQty: row.closeQty ?? row.qty, closeValue: row.closeValue,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function movementRow(row, doc, delta, { businessId, finYear, jobId, user, reason }) {
  return {
    businessId: toObjectId(businessId),
    finYear,
    type: delta > 0 ? MOVEMENT_TYPES.ADJUST_IN : MOVEMENT_TYPES.ADJUST_OUT,
    barcodeId: doc._id,
    barcodeNo: doc.barcodeNo || row.barcode,
    itemId: toObjectId(doc.itemId),
    itemCode: doc.itemCode || row.itemCode,
    itemName: doc.itemName || row.itemName,
    uom: doc.uom || row.uom,
    batchType: doc.batchType,
    qty: delta,
    fromLocationId: delta < 0 ? toObjectId(row.locationId) : null,
    toLocationId: delta > 0 ? toObjectId(row.locationId) : null,
    statusBefore: delta < 0 ? BARCODE_STATUS.IN_STOCK : '',
    statusAfter: BARCODE_STATUS.IN_STOCK,
    refModel: IMPORT_SOURCE,
    refId: null,
    refNo: jobId || '',
    reason,
    notes: `Item Wise Summary Excel row ${row.row}`,
    userId: toObjectId(user?.id),
    userName: user?.name || '',
    userEmail: user?.email || '',
    at: new Date(),
  };
}

function rowError(row, message, field = '') {
  return { row: row.row, barcode: row.barcode, itemCode: row.itemCode, field, message };
}

export async function executeApprovedImport({
  buffer,
  fileName = '',
  businessId,
  finYear = '',
  strategy = STRATEGIES.CREATE,
  approvals = {},
  replaceStock = false,
  user = null,
  locationAllowed = null,
  jobId = '',
  sheetName = '',
}) {
  if (strategy === STRATEGIES.UPDATE && !replaceStock) {
    const error = new Error('Stock replacement must be confirmed before an update import can run.');
    error.status = 422;
    error.code = 'REPLACE_NOT_CONFIRMED';
    throw error;
  }

  const startedAt = Date.now();
  let analysisRun = await analyzeBuffer({
    buffer, fileName, businessId, finYear, strategy, approvals, locationAllowed,
  });

  let mastersCreated = [];
  let masterFailures = [];
  if (strategy === STRATEGIES.CREATE) {
    const creation = await createApprovedMasters({
      analysis: analysisRun.analysis,
      lookup: analysisRun.lookup,
      businessId,
      userId: user?.id,
    });
    mastersCreated = creation.created;
    masterFailures = creation.failures;

    if (mastersCreated.length) {
      const normalized = normalizeApprovals(approvals);
      analysisRun = {
        ...analysisRun,
        analysis: analyzeParsedWorkbook({
          parsed: analysisRun.parsed,
          lookup: analysisRun.lookup,
          existing: analysisRun.existing,
          strategy,
          approvals: normalized,
          locationAllowed,
        }),
      };
    }
  }

  const detail = analysisRun.analysis.detail || [];
  const createRows = detail.filter((row) => row.action === 'create');
  const updateRows = detail.filter((row) => row.action === 'update');
  const errors = [];
  const pushError = (row, message, field = '') => {
    if (errors.length < MAX_ERRORS) errors.push(rowError(row, message, field));
  };

  let imported = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = detail.filter((row) => row.status !== 'ready').length;
  let failed = 0;
  let stockAdjustments = 0;
  let qtyImported = 0;
  let valueImported = 0;

  /* Create in chunks. Each chunk's barcode numbers are checked against the
     database once more inside the transaction, so a concurrent import cannot
     create a second row for the same number. The transaction commits the
     barcode rows and their opening-stock ledger together. */
  for (const part of chunk(createRows, 400)) {
    const docs = [];
    for (const row of part) {
      try {
        docs.push({ row, doc: barcodeDoc(row, { businessId, finYear, fileName, sheetName }) });
      } catch (error) {
        failed += 1;
        pushError(row, error.message);
      }
    }
    if (!docs.length) continue;

    let inserted = [];
    try {
      inserted = await withTransaction(async (session) => {
        /* A barcode the workbook states is business-wide unique. The Item Code
           fallback the export uses is only unique within its location: this ERP
           holds the same item code at several warehouses, so the check has to
           match the analysis instead of skipping the second warehouse. */
        const providedCodes = docs.filter(({ row }) => row.barcodeProvided)
          .map(({ doc }) => String(doc.barcodeNo));
        const fallbackPairs = docs.filter(({ row }) => !row.barcodeProvided)
          .map(({ doc }) => ({ barcodeNo: String(doc.barcodeNo), locationId: String(doc.locationId) }));
        const takenRows = await BarcodeLabel.find({
          businessId: String(businessId),
          $or: [
            ...(providedCodes.length ? [{ barcodeNo: { $in: providedCodes } }] : []),
            ...(fallbackPairs.length ? [{
              barcodeNo: { $in: [...new Set(fallbackPairs.map((pair) => pair.barcodeNo))] },
              locationId: { $in: [...new Set(fallbackPairs.map((pair) => pair.locationId))] },
            }] : []),
          ],
        }).select('barcodeNo locationId').session(session).lean();
        const takenProvided = new Set(takenRows.map((row) => String(row.barcodeNo)));
        const takenPairs = new Set(takenRows.map((row) => `${String(row.barcodeNo)}|${String(row.locationId || '')}`));
        const fresh = docs.filter(({ row, doc }) => {
          const code = String(doc.barcodeNo);
          const taken = row.barcodeProvided
            ? takenProvided.has(code)
            : takenPairs.has(`${code}|${String(doc.locationId)}`);
          if (taken) {
            skipped += 1;
            pushError(row, 'This barcode already exists; it was not created again.', 'Barcode');
            return false;
          }
          return true;
        });
        if (!fresh.length) return [];

        const payload = fresh.map(({ doc }) => doc);
        const result = await BarcodeLabel.collection.insertMany(payload, {
          ordered: false, ...(session ? { session } : {}),
        });
        const insertedIds = result.insertedIds || {};
        const ledger = [];
        const written = fresh.map(({ row, doc }, index) => {
          const id = insertedIds[index] || doc._id;
          const stored = { ...doc, _id: id };
          if (Number(row.qty) > 0) {
            ledger.push(movementRow(row, stored, Number(row.qty), {
              businessId, finYear, jobId, user,
              reason: 'Opening stock imported from Item Wise Summary',
            }));
          }
          return { row, doc: stored };
        });
        if (ledger.length) {
          await StockMovement.insertMany(ledger, session ? { session, ordered: false } : { ordered: false });
        }
        return written;
      }) || [];
    } catch (error) {
      /* MongoDB transactions are all-or-nothing: when this throws, this chunk
         wrote nothing. Counting the whole chunk as failed is therefore true. */
      failed += docs.length;
      docs.forEach(({ row }) => pushError(row, error.message));
      console.error('[item-wise-summary] create chunk failed:', error.message);
      continue;
    }

    inserted.forEach(({ row }) => {
      imported += 1;
      qtyImported += Number(row.qty) || 0;
      valueImported += Number(row.closeValue) || 0;
      if (Number(row.qty) > 0) stockAdjustments += 1;
    });
  }

  /* Updating stock: guarded by the barcode's own status, so a unit sold while
     the preview was open is not restated. The old quantity is read back and a
     signed adjustment is written for the difference. */
  for (const part of chunk(updateRows, 150)) {
    try {
      await withTransaction(async (session) => {
        for (const row of part) {
          const set = {
            qty: String(row.qty),
            qtyNum: Number(row.qty),
            openingQty: row.openQty === null || row.openQty === undefined ? 0 : Number(row.openQty),
            'customFields.stockSummary': {
              openQty: row.openQty, openValue: row.openValue,
              inwardQty: row.inwardQty, inwardValue: row.inwardValue,
              outwardQty: row.outwardQty, outwardValue: row.outwardValue,
              closeQty: row.closeQty ?? row.qty, closeValue: row.closeValue,
            },
            'customFields.itemWiseRow': row.row,
            updatedAt: new Date(),
          };
          /* A blank workbook date must not erase the date the barcode already
             carries; the summary only replaces what it actually states. */
          if (row.stockDateValue) set.stockDate = row.stockDateValue;
          if (row.stockAge !== null && row.stockAge !== undefined) set.stockAge = row.stockAge;

          const current = await BarcodeLabel.findOneAndUpdate(
            { _id: toObjectId(row.existingId), status: BARCODE_STATUS.IN_STOCK },
            { $set: set },
            { new: false, session: session || undefined, projection: { qtyNum: 1 } }
          ).lean();

          if (!current) {
            skipped += 1;
            pushError(row, 'This barcode is no longer in stock; its quantity was not changed.', 'Barcode');
            continue;
          }
          const delta = Number(row.qty) - (Number(current.qtyNum) || 0);
          if (!delta) {
            unchanged += 1;
            continue;
          }
          await StockMovement.insertMany([movementRow(row, { ...current, _id: current._id }, delta, {
            businessId, finYear, jobId, user,
            reason: 'Stock replaced from Item Wise Summary import',
          })], session ? { session, ordered: true } : { ordered: true });
          updated += 1;
          stockAdjustments += 1;
        }
      });
    } catch (error) {
      failed += part.length;
      part.forEach((row) => pushError(row, error.message));
      console.error('[item-wise-summary] update chunk failed:', error.message);
    }
  }

  const mastersByType = {};
  mastersCreated.forEach((entry) => {
    mastersByType[entry.type] = (mastersByType[entry.type] || 0) + 1;
  });

  const reusedRefs = new Set();
  detail.filter((row) => row.action === 'create' || row.action === 'update').forEach((row) => {
    const resolved = row.resolved || {};
    ['locationId', 'supplierId', 'itemId', 'groupId', 'subGroupId', 'uomId', 'hsnId'].forEach((key) => {
      if (resolved[key]) reusedRefs.add(`${key}:${resolved[key]}`);
    });
  });

  const result = {
    totalRows: analysisRun.analysis.summary.totalRows,
    dataRows: analysisRun.analysis.summary.dataRows,
    imported,
    updated,
    unchanged,
    skipped,
    failed,
    mastersCreated: mastersCreated.length,
    mastersCreatedByType: mastersByType,
    mastersReused: reusedRefs.size,
    masterFailures,
    barcodesCreated: imported,
    barcodesUpdated: updated,
    stockAdjustments,
    totalQty: Number(qtyImported.toFixed(3)),
    totalValue: Number(valueImported.toFixed(2)),
    errors,
    errorCount: errors.length,
    durationMs: Date.now() - startedAt,
    strategy,
  };

  return { result, analysis: analysisRun.analysis };
}

export default {
  sha256,
  loadMasterData,
  analyzeBuffer,
  executeApprovedImport,
  createApprovedMasters,
};
