import mongoose from 'mongoose';
import crypto from 'crypto';

import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import Item from '@/models/Item';
import { Supplier, Agent } from '@/lib/contacts';
import Business from '@/models/Business';
import ContactType from '@/models/ContactType';
import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import ProductGroup from '@/models/ProductGroup';
import Uom from '@/models/Uom';
import CompanyLocation from '@/models/CompanyLocation';
import HsrImportJob from '@/models/HsrImportJob';
import { applyMovement, withTransaction } from '@/lib/inventory';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import { barcodeSpellings } from '@/lib/barcodeValue';
import { nextContactId } from '@/lib/contactId';
import { isSplitContactStorage } from '@/lib/contactStorage';
import { uomTypeOf, batchTypeOf } from '@/lib/barcodeUnits';
import {
  analyzeImport,
  buildMasterIndex,
  buildTemplateWorkbook,
  buildErrorWorkbook,
  extractBarcodeValues,
  lookupMaster,
  lookupMasterCandidates,
  masterReferenceAliases,
  masterReferenceKey,
  masterMappingAliasKey,
  validateMasterValues,
  parseDateValue,
  parseNumberValue,
  cleanText,
  normalizeKey,
} from '@/lib/barcodeMasterImport';
import {
  IMPORT_SCOPES,
  IMPORT_STRATEGIES,
  IMPORT_JOB_OPERATIONS,
  STRATEGIES_BY_SCOPE,
  MASTER_TYPES,
  MASTER_TYPE_LIST,
  MAX_FILE_BYTES,
} from '@/lib/barcodeMasterImportConstants';
import {
  createImportSession,
  readImportSessionMeta,
  readImportSessionWorkbook,
  updateImportSession,
} from '@/lib/importSessionStore';

/* ==========================================================================
   BARCODE + MASTER DATA IMPORT - the database half.

   lib/barcodeMasterImport.js parses and validates the workbook and decides
   what SHOULD happen. This module is the only place that actually writes:
   it loads the real masters, resolves the plan against them, creates the
   masters (in dependency order), inserts barcode rows and lets the inventory
   engine open their stock.

   Three rules hold the whole file together:

   1. NOTHING IS INVENTED. A barcode number, item code, contact code or
      document number always comes from the workbook or from the database's
      own counters (nextContactId). No value is guessed to get past a
      duplicate.

   2. NOTHING IS OVERWRITTEN SILENTLY. New barcodes are only inserted when
      the number does not already exist at execution time (re-read, not the
      preview). An existing barcode's quantity changes only under the
      explicit stock-replacement strategy with its confirmation. Masters that
      already exist are reused, never edited.

   3. EVERY STOCK CHANGE GOES THROUGH THE INVENTORY ENGINE. New units open
      with applyMovement(GRC_IN); a replaced quantity writes an ADJUST_IN /
      ADJUST_OUT delta. The lifecycle fields are never written directly, so
      the movement ledger and the barcode row cannot disagree.

   The analysis metadata is persisted by lib/importSessionStore.js; the
   browser never posts row data back, so what was previewed and what is
   executed are the same workbook bytes.
   ========================================================================== */

const CONTACT_TYPE_KEY = 'Contact Type';
const MASTER_CHUNK = 100;
const BARCODE_CHUNK = 200;
const EXISTING_LOOKUP_CHUNK = 400;
const ERROR_LIMIT = 500;
const SOURCE = 'BARCODE_MASTER_IMPORT';
const MOVEMENT_REF_MODEL = 'import';

/* Dependency order: an Item needs its HSN, UOM, Sub Group (and that group),
   and a Sub Group needs its Group; contacts need their Contact Type. */
const MASTER_CREATE_ORDER = [
  MASTER_TYPES.HSN,
  MASTER_TYPES.UOM,
  MASTER_TYPES.GROUP,
  MASTER_TYPES.SUB_GROUP,
  MASTER_TYPES.LOCATION,
  MASTER_TYPES.SUPPLIER,
  MASTER_TYPES.AGENT,
  MASTER_TYPES.ITEM,
];

export class ImportServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportServiceError';
    this.code = code;
    this.status = details.status || 400;
    this.details = details;
  }
}

/* Master creation and mapping save both read the session, write masters and
   rewrite the session. Serialize those mutations inside this server process so
   two tabs/requests cannot both see "no match" and insert the same master.
   Database uniqueness still governs across instances; the duplicate recheck
   in createMasterEntry remains the final guard. */
const sessionMutationLocks = new Map();

function withSessionLock(token, task) {
  const key = String(token || '');
  if (!key) return task();
  const previous = sessionMutationLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  const settle = run.catch(() => {});
  sessionMutationLocks.set(key, settle);
  settle.then(() => {
    if (sessionMutationLocks.get(key) === settle) sessionMutationLocks.delete(key);
  });
  return run;
}

/* ------------------------------------------------------------------ ids --- */

function objectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const text = String(value);
  return mongoose.isValidObjectId(text) ? new mongoose.Types.ObjectId(text) : null;
}

function idOf(value) {
  return value ? String(value._id ?? value.id ?? value) : '';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return { $regex: `^${escapeRegex(cleanText(value))}$`, $options: 'i' };
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toDateOrNull(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = parseDateValue(value);
  return parsed?.value instanceof Date && !Number.isNaN(parsed.value.getTime()) ? parsed.value : null;
}

function numberOrNull(value) {
  const parsed = parseNumberValue(value);
  return parsed?.error ? null : (parsed?.value ?? null);
}

function businessFilter(businessId) {
  const oid = objectId(businessId);
  return oid ? { businessId: oid } : {};
}

/* =========================================================== references === */

/* Read the masters the workbook can point at, scoped to ONE business, and
   build both the lookup index and the plain lists the template's reference
   sheet shows. A missing business is not silently widened to every company. */
export async function loadImportReferences({ businessId } = {}) {
  const oid = objectId(businessId);
  if (!oid) throw new ImportServiceError('BUSINESS_REQUIRED', 'Choose the business this import belongs to.');

  const contactFilter = isSplitContactStorage()
    ? { businessId: oid }
    : { businessId: oid, contactKind: 'Supplier' };
  const agentFilter = isSplitContactStorage()
    ? { businessId: oid }
    : { businessId: oid, contactKind: 'Agent' };

  const [suppliers, agents, items, hsns, groups, uoms, locations, contactTypes, taxes, business] = await Promise.all([
    Supplier.find(contactFilter)
      .select('contactId businessName firstName lastName typeId gstNo billingCity billingMobile billingEmail billingAddressLine1')
      .lean(),
    Agent.find(agentFilter)
      .select('contactId businessName firstName lastName typeId gstNo billingCity billingMobile billingEmail billingAddressLine1')
      .lean(),
    Item.find({ businessId: oid })
      .select('name itemCode subGroupId uomId hsnId uniqueBarcode itemType prefix description rsp wsp')
      .lean(),
    Hsn.find({ businessId: oid }).select('code status description taxSlabs').lean(),
    ProductGroup.find({ businessId: oid }).select('name prefix parentId').lean(),
    Uom.find({ businessId: oid }).select('name shortName allowDecimal defaultValue').lean(),
    CompanyLocation.find({ businessId: oid }).select('name city state zipCode gstin mobile email').lean(),
    ContactType.find({ businessId: oid }).select('name contactType prefix').lean(),
    Tax.find({ businessId: oid }).select('taxName igst cgst sgst cess status').lean(),
    Business.findById(oid).select('name businessPrintName').lean(),
  ]);

  const raw = {
    business: business ? {
      id: String(business._id),
      name: cleanText(business.name),
      printName: cleanText(business.businessPrintName),
    } : null,
    suppliers: suppliers.map((row) => ({
      id: String(row._id),
      contactId: cleanText(row.contactId),
      businessName: cleanText(row.businessName)
        || [row.firstName, row.lastName].map(cleanText).filter(Boolean).join(' '),
      typeId: String(row.typeId || ''),
      gstNo: cleanText(row.gstNo),
      city: cleanText(row.billingCity),
      mobile: cleanText(row.billingMobile),
      email: cleanText(row.billingEmail),
      address: cleanText(row.billingAddressLine1),
    })),
    agents: agents.map((row) => ({
      id: String(row._id),
      contactId: cleanText(row.contactId),
      businessName: cleanText(row.businessName)
        || [row.firstName, row.lastName].map(cleanText).filter(Boolean).join(' '),
      typeId: String(row.typeId || ''),
      gstNo: cleanText(row.gstNo),
      city: cleanText(row.billingCity),
      mobile: cleanText(row.billingMobile),
      email: cleanText(row.billingEmail),
      address: cleanText(row.billingAddressLine1),
    })),
    items: items.map((row) => ({
      id: String(row._id),
      name: cleanText(row.name),
      code: cleanText(row.itemCode),
      subGroupId: String(row.subGroupId || ''),
      uomId: String(row.uomId || ''),
      hsnId: String(row.hsnId || ''),
      uniqueBarcode: cleanText(row.uniqueBarcode),
      itemType: cleanText(row.itemType),
      prefix: cleanText(row.prefix),
      description: cleanText(row.description),
      rsp: row.rsp ?? null,
      wsp: row.wsp ?? null,
    })),
    hsn: hsns.map((row) => ({ id: String(row._id), code: cleanText(row.code), status: cleanText(row.status) })),
    groups: groups.map((row) => ({
      id: String(row._id),
      name: cleanText(row.name),
      prefix: cleanText(row.prefix),
      parentId: String(row.parentId || ''),
    })),
    uoms: uoms.map((row) => ({
      id: String(row._id),
      name: cleanText(row.name),
      shortName: cleanText(row.shortName),
      allowDecimal: cleanText(row.allowDecimal),
    })),
    locations: locations.map((row) => ({
      id: String(row._id),
      name: cleanText(row.name),
      city: cleanText(row.city),
      state: cleanText(row.state),
      zipCode: cleanText(row.zipCode),
      gstin: cleanText(row.gstin),
    })),
    contactTypes: contactTypes.map((row) => ({
      id: String(row._id),
      name: cleanText(row.name),
      contactType: cleanText(row.contactType),
      prefix: cleanText(row.prefix),
    })),
    taxes: taxes.map((row) => ({
      id: String(row._id),
      taxName: cleanText(row.taxName),
      igst: row.igst ?? null,
      cgst: row.cgst ?? null,
      sgst: row.sgst ?? null,
      cess: row.cess ?? null,
      status: cleanText(row.status),
    })),
  };

  const index = buildIndexFromRaw(raw);
  const locationNameById = new Map(raw.locations.map((row) => [row.id, row.name]));
  const reference = {
    suppliers: raw.suppliers.map((row) => ({ code: row.contactId, name: row.businessName })),
    agents: raw.agents.map((row) => ({ code: row.contactId, name: row.businessName })),
    items: raw.items.map((row) => ({ code: row.code, name: row.name })),
    hsn: raw.hsn.map((row) => ({ code: row.code })),
    groups: raw.groups.filter((row) => !row.parentId).map((row) => ({ name: row.name })),
    subGroups: raw.groups.filter((row) => row.parentId).map((row) => ({ name: row.name })),
    uoms: raw.uoms.map((row) => ({ name: row.name || row.shortName })),
    locations: raw.locations.map((row) => ({ name: row.name })),
    contactTypes: raw.contactTypes.map((row) => ({ name: row.name })),
  };

  return {
    businessId: String(oid),
    raw,
    index,
    reference,
    locationNameById,
    taxes: raw.taxes,
    locations: raw.locations,
    contactTypes: raw.contactTypes,
  };
}

function buildIndexFromRaw(raw) {
  return buildMasterIndex({
    suppliers: raw.suppliers,
    agents: raw.agents,
    items: raw.items,
    hsn: raw.hsn,
    groups: raw.groups,
    uoms: raw.uoms,
    locations: raw.locations,
    contactTypes: raw.contactTypes,
    business: raw.business || null,
  });
}

export async function buildImportTemplate({ businessId, scope = IMPORT_SCOPES.BARCODE_MASTER } = {}) {
  if (!Object.values(IMPORT_SCOPES).includes(scope)) {
    throw new ImportServiceError('BAD_SCOPE', 'Choose a valid import type.');
  }
  const references = await loadImportReferences({ businessId });
  return buildTemplateWorkbook({ reference: references.reference, scope });
}

/* ==================================================== existing barcodes === */

/* The preview only needs the barcodes the workbook mentions. They are read
   in chunks, by every spelling the scanner accepts, scoped to the business -
   never the business's whole barcode history. */
export async function loadExistingBarcodes({ businessId, values = [], locationNameById = new Map() } = {}) {
  const oid = objectId(businessId);
  if (!oid || !values.length) return [];

  const spellings = [...new Set(values.flatMap((value) => barcodeSpellings(value)).filter(Boolean))];
  const found = new Map();
  const businessScope = {
    $or: [
      { businessId: String(oid) },
      { currentBusinessId: oid },
    ],
  };

  for (let i = 0; i < spellings.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = spellings.slice(i, i + EXISTING_LOOKUP_CHUNK);
    const rows = await BarcodeLabel.find({
      $and: [
        businessScope,
        {
          $or: [
            { barcodeNo: { $in: chunk } },
            { barcodeGenerated: { $in: chunk } },
            { oldBarcode: { $in: chunk } },
          ],
        },
      ],
    })
      .select('_id barcodeNo barcodeGenerated oldBarcode itemCode itemId qty qtyNum status currentLocationId businessId')
      .lean();

    rows.forEach((row) => {
      const id = String(row._id);
      if (found.has(id)) return;
      const locationId = String(row.currentLocationId || '');
      found.set(id, {
        id,
        barcodeNo: cleanText(row.barcodeNo),
        barcodeGenerated: cleanText(row.barcodeGenerated),
        oldBarcode: cleanText(row.oldBarcode),
        itemCode: cleanText(row.itemCode),
        itemId: String(row.itemId || ''),
        qtyNum: Number(row.qtyNum ?? row.qty ?? 0) || 0,
        status: cleanText(row.status),
        currentLocationId: locationId,
        currentLocationName: locationNameById.get(locationId) || '',
      });
    });
  }

  return [...found.values()];
}

/* ============================================================== analysis === */

export async function analyzeWorkbookBuffer({
  buffer,
  fileName = '',
  scope = IMPORT_SCOPES.BARCODE_MASTER,
  businessId,
  locationId,
  maxRows,
  masterMappings = [],
} = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new ImportServiceError('NO_FILE', 'Choose an Excel workbook (.xlsx) to import.');
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new ImportServiceError('FILE_TOO_LARGE', 'This workbook is larger than the 20 MB limit. Split it into smaller files.', { status: 413 });
  }
  if (!Object.values(IMPORT_SCOPES).includes(scope)) {
    throw new ImportServiceError('BAD_SCOPE', 'Choose a valid import type.');
  }

  const references = await loadImportReferences({ businessId });
  const { values } = extractBarcodeValues({ buffer, scope });
  const existingBarcodes = await loadExistingBarcodes({
    businessId,
    values,
    locationNameById: references.locationNameById,
  });

  const defaultLocation = references.locations.find((row) => String(row.id) === String(locationId || '')) || null;
  if (locationId && !defaultLocation) {
    throw new ImportServiceError('BAD_LOCATION', 'The selected location does not belong to this business.');
  }

  const analysis = analyzeImport({
    buffer,
    scope,
    fileName,
    masterIndex: references.index,
    existingBarcodes,
    defaultLocation,
    maxRows,
    masterMappings,
    business: references.raw.business || null,
  });

  return { analysis, references };
}

/* =============================================================== masters === */

function masterLabel(type, fields) {
  return cleanText(fields.name || fields.code || fields.shortName);
}

function defaultContactTypeName(type) {
  return type === MASTER_TYPES.AGENT ? 'Agent' : 'Supplier';
}

async function findExistingMasterDoc(type, fields, ctx) {
  const businessId = ctx.businessId;
  const name = cleanText(fields.name);
  const code = cleanText(fields.code);

  const findOne = async (Model, filter) => {
    const rows = await Model.find({ businessId, ...filter }).limit(2).lean();
    return rows.length ? rows[0] : null;
  };

  if (type === MASTER_TYPES.HSN) {
    if (!code) return null;
    return (await findOne(Hsn, { code })) || findOne(Hsn, { code: exactRegex(code) });
  }
  if (type === MASTER_TYPES.UOM) {
    if (name) {
      const exact = await findOne(Uom, { name });
      if (exact) return exact;
    }
    if (code) {
      const short = await findOne(Uom, { shortName: code });
      if (short) return short;
      const shortInsensitive = await findOne(Uom, { shortName: exactRegex(code) });
      if (shortInsensitive) return shortInsensitive;
    }
    return name ? findOne(Uom, { name: exactRegex(name) }) : null;
  }
  if (type === MASTER_TYPES.GROUP) {
    if (!name) return null;
    return (await findOne(ProductGroup, { name, parentId: null }))
      || findOne(ProductGroup, { name: exactRegex(name), parentId: null });
  }
  if (type === MASTER_TYPES.SUB_GROUP) {
    if (!name) return null;
    const parent = await resolveMaster(MASTER_TYPES.GROUP, fields.parent, ctx);
    if (!parent?.id) return null;
    return (await findOne(ProductGroup, { name, parentId: objectId(parent.id) }))
      || findOne(ProductGroup, { name: exactRegex(name), parentId: objectId(parent.id) });
  }
  if (type === MASTER_TYPES.LOCATION) {
    if (!name) return null;
    return (await findOne(CompanyLocation, { name })) || findOne(CompanyLocation, { name: exactRegex(name) });
  }
  if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) {
    const Model = type === MASTER_TYPES.SUPPLIER ? Supplier : Agent;
    const kind = type === MASTER_TYPES.SUPPLIER ? 'Supplier' : 'Agent';
    const kindFilter = isSplitContactStorage() ? {} : { contactKind: kind };
    const rows = await Model.find({ businessId, ...kindFilter, ...(code ? { contactId: code } : { businessName: name }) }).limit(2).lean();
    if (rows.length) return rows[0];
    if (!code && !name) return null;
    return Model.findOne({
      businessId,
      ...kindFilter,
      $or: [
        ...(code ? [{ contactId: exactRegex(code) }] : []),
        ...(name ? [{ businessName: exactRegex(name) }] : []),
      ],
    }).lean();
  }
  if (type === MASTER_TYPES.ITEM) {
    if (code) {
      const exact = await findOne(Item, { itemCode: code });
      if (exact) return exact;
      const codeInsensitive = await findOne(Item, { itemCode: exactRegex(code) });
      if (codeInsensitive) return codeInsensitive;
    }
    return name ? findOne(Item, { name: exactRegex(name) }) : null;
  }
  return null;
}

async function resolveContactTypeId(type, fields, ctx) {
  const wanted = cleanText(fields.contactType) || defaultContactTypeName(type);
  const fromIndex = lookupMaster(ctx.index, CONTACT_TYPE_KEY, wanted);
  if (fromIndex?.id) return fromIndex.id;

  const fromCreated = ctx.created.contactTypes.get(normalizeKey(wanted));
  if (fromCreated) return fromCreated.id;

  const kind = type === MASTER_TYPES.SUPPLIER ? 'Supplier' : 'Agent';
  const rows = await ContactType.find({
    businessId: ctx.businessId,
    $or: [{ name: exactRegex(wanted) }, { contactType: exactRegex(wanted) }, { contactType: kind }],
  }).limit(1).lean();
  if (rows.length) return String(rows[0]._id);

  throw new ImportServiceError(
    'CONTACT_TYPE_MISSING',
    `${type} "${cleanText(fields.name)}" cannot be created: Contact Type "${wanted}" does not exist. Create the Contact Type in Masters first.`,
  );
}

function rememberCreated(ctx, type, record) {
  const keyName = normalizeKey(record.name || record.code);
  const keyCode = normalizeKey(record.code || '');
  const maps = {
    [MASTER_TYPES.HSN]: [ctx.created.hsn, [keyCode, keyName]],
    [MASTER_TYPES.UOM]: [ctx.created.uoms, [keyName, keyCode]],
    [MASTER_TYPES.GROUP]: [ctx.created.groups, [keyName]],
    [MASTER_TYPES.SUB_GROUP]: [ctx.created.subGroups, [`${normalizeKey(record.parentName)}|${keyName}`, keyName]],
    [MASTER_TYPES.LOCATION]: [ctx.created.locations, [keyName]],
    [MASTER_TYPES.SUPPLIER]: [ctx.created.suppliers, [keyName, keyCode]],
    [MASTER_TYPES.AGENT]: [ctx.created.agents, [keyName, keyCode]],
    [MASTER_TYPES.ITEM]: [ctx.created.items, [keyCode, keyName]],
  };
  const [map, keys] = maps[type] || [null, []];
  if (!map) return;
  keys.filter(Boolean).forEach((key) => { if (!map.has(key)) map.set(key, record); });
}

/* Resolve a master at write time: what this import already created, then the
   index read at the start, then one last database read. The last step matters
   because another operator may have created the master while this import was
   being reviewed. */
async function resolveMaster(type, value, ctx) {
  const text = cleanText(value);
  if (!text) return null;
  const key = normalizeKey(text);

  const createdMaps = {
    [MASTER_TYPES.HSN]: ctx.created.hsn,
    [MASTER_TYPES.UOM]: ctx.created.uoms,
    [MASTER_TYPES.GROUP]: ctx.created.groups,
    [MASTER_TYPES.SUB_GROUP]: ctx.created.subGroups,
    [MASTER_TYPES.LOCATION]: ctx.created.locations,
    [MASTER_TYPES.SUPPLIER]: ctx.created.suppliers,
    [MASTER_TYPES.AGENT]: ctx.created.agents,
    [MASTER_TYPES.ITEM]: ctx.created.items,
  };
  const created = createdMaps[type]?.get(key);
  if (created) return created;

  const fromIndex = lookupMaster(ctx.index, type, text);
  if (fromIndex) return fromIndex;

  const doc = await findExistingMasterDoc(type, { name: text, code: text }, ctx);
  if (!doc) return null;
  const mapped = {
    id: String(doc._id),
    code: cleanText(doc.itemCode || doc.contactId || doc.code || doc.shortName),
    name: cleanText(doc.name || doc.businessName || doc.code),
    subGroupId: String(doc.subGroupId || ''),
    uomId: String(doc.uomId || ''),
    hsnId: String(doc.hsnId || ''),
    uniqueBarcode: cleanText(doc.uniqueBarcode),
  };
  return mapped;
}

async function resolveSubGroupId(fields, ctx) {
  const name = cleanText(fields.name);
  if (!name) return null;
  const key = `${normalizeKey(fields.parent)}|${normalizeKey(name)}`;
  const created = ctx.created.subGroups.get(key)
    || [...ctx.created.subGroups.values()].find((row) => normalizeKey(row.name) === normalizeKey(name)
      && (!fields.parent || normalizeKey(row.parentName) === normalizeKey(fields.parent)));
  if (created?.id) return created.id;

  const parent = cleanText(fields.parent)
    ? await resolveMaster(MASTER_TYPES.GROUP, fields.parent, ctx)
    : null;
  const fromIndex = lookupMaster(ctx.index, MASTER_TYPES.SUB_GROUP, name, {
    parentId: parent?.id || null,
    parentName: fields.parent,
  });
  if (fromIndex?.id) return fromIndex.id;

  const rows = await ProductGroup.find({
    businessId: ctx.businessId,
    name: exactRegex(name),
    ...(parent?.id ? { parentId: objectId(parent.id) } : {}),
  }).limit(1).lean();
  return rows.length ? String(rows[0]._id) : null;
}

/* Create ONE master, idempotently. Returns
   { created, existed, id, code, name, type }. A master that already exists is
   returned as `existed: true` and left untouched - the importer never edits
   a master it did not create in this run. */
export async function createMasterEntry({ type, fields = {}, ctx }) {
  if (!MASTER_TYPE_LIST.includes(type)) {
    throw new ImportServiceError('BAD_MASTER_TYPE', 'Choose a valid Master Type.');
  }
  const existing = await findExistingMasterDoc(type, fields, ctx);
  if (existing) {
    return {
      created: false,
      existed: true,
      type,
      id: String(existing._id),
      code: cleanText(existing.itemCode || existing.contactId || existing.code || existing.shortName || fields.code),
      name: cleanText(existing.name || existing.businessName || existing.code || fields.name),
    };
  }

  const businessId = ctx.businessId;
  const sessionOpts = ctx.session ? { session: ctx.session } : {};
  const create = async (Model, doc) => {
    const [created] = await Model.create([doc], sessionOpts);
    return created;
  };

  if (type === MASTER_TYPES.HSN) {
    const code = cleanText(fields.code);
    if (!code) throw new ImportServiceError('MASTER_FIELD_MISSING', 'HSN code is required.');
    const doc = {
      businessId,
      code,
      description: cleanText(fields.description),
      status: 'Active',
      effectiveDate: toDateOrNull(fields.effectiveDate),
    };
    const gst = numberOrNull(fields.gst);
    if (gst !== null) {
      const tax = (ctx.taxes || []).find((row) => Number(row.igst) === gst)
        || (ctx.taxes || []).find((row) => Number(row.cgst) * 2 === gst);
      if (tax) doc.taxSlabs = [{ gstTaxNameId: objectId(tax.id) }];
    }
    const created = await create(Hsn, doc);
    const record = { id: String(created._id), code, name: code };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.UOM) {
    const name = cleanText(fields.name) || cleanText(fields.code);
    const shortName = cleanText(fields.shortName) || cleanText(fields.code) || name;
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', 'UOM name is required.');
    const created = await create(Uom, {
      businessId,
      name,
      shortName,
      allowDecimal: '',
      defaultValue: '',
    });
    const record = { id: String(created._id), code: shortName, name };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.GROUP) {
    const name = cleanText(fields.name);
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', 'Group name is required.');
    const created = await create(ProductGroup, {
      businessId,
      name,
      prefix: cleanText(fields.prefix),
      parentId: null,
    });
    const record = { id: String(created._id), name };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.SUB_GROUP) {
    const name = cleanText(fields.name);
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', 'Sub Group name is required.');
    const parentName = cleanText(fields.parent);
    const parent = parentName ? await resolveMaster(MASTER_TYPES.GROUP, parentName, ctx) : null;
    if (!parent?.id) {
      throw new ImportServiceError(
        'GROUP_MISSING',
        `Sub Group "${name}" cannot be created: Group "${parentName || '(blank)'}" does not exist.`,
      );
    }
    const created = await create(ProductGroup, {
      businessId,
      name,
      prefix: cleanText(fields.prefix),
      parentId: objectId(parent.id),
    });
    const record = { id: String(created._id), name, parentName, parentId: parent.id };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.LOCATION) {
    const name = cleanText(fields.name);
    const city = cleanText(fields.city);
    const zipCode = cleanText(fields.zipCode);
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', 'Location name is required.');
    if (!city) throw new ImportServiceError('MASTER_FIELD_MISSING', `Location "${name}" cannot be created: City is required.`);
    if (!zipCode) throw new ImportServiceError('MASTER_FIELD_MISSING', `Location "${name}" cannot be created: Zip Code is required.`);
    const created = await create(CompanyLocation, {
      businessId,
      name,
      city,
      state: cleanText(fields.state),
      zipCode,
      addressLine1: cleanText(fields.address),
      mobile: cleanText(fields.mobile),
      email: cleanText(fields.email),
      gstin: cleanText(fields.gstNo),
    });
    const record = { id: String(created._id), name, city, zipCode };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) {
    const name = cleanText(fields.name);
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', `${type} name is required.`);
    const Model = type === MASTER_TYPES.SUPPLIER ? Supplier : Agent;
    const typeId = await resolveContactTypeId(type, fields, ctx);
    const contactId = await nextContactId(ContactType, typeId);
    const doc = {
      businessId,
      typeId: objectId(typeId),
      businessName: name,
      shortName: cleanText(fields.shortName),
      gstNo: cleanText(fields.gstNo).toUpperCase(),
      billingAddressLine1: cleanText(fields.address),
      billingCity: cleanText(fields.city),
      billingState: cleanText(fields.state),
      billingZipCode: cleanText(fields.zipCode),
      billingMobile: cleanText(fields.mobile),
      billingEmail: cleanText(fields.email),
      contactId,
      ...(isSplitContactStorage() ? {} : { contactKind: type }),
    };
    let created;
    try {
      created = await create(Model, doc);
    } catch (err) {
      if (err?.code === 11000) {
        throw new ImportServiceError(
          'MASTER_CONFLICT',
          `${type} "${name}" was not created: a ${type.toLowerCase()} with the same unique value (for example the GST No) already exists.`,
          { cause: err.message },
        );
      }
      throw err;
    }
    const record = { id: String(created._id), code: contactId, name };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  if (type === MASTER_TYPES.ITEM) {
    const code = cleanText(fields.code);
    const name = cleanText(fields.name);
    if (!code) throw new ImportServiceError('MASTER_FIELD_MISSING', 'Item Code is required.');
    if (!name) throw new ImportServiceError('MASTER_FIELD_MISSING', `Item "${code}" cannot be created: Item Name is required.`);

    const subGroupId = await resolveSubGroupId({ name: fields.parent, parent: fields.groupName || '' }, ctx);
    if (!subGroupId) {
      throw new ImportServiceError(
        'SUB_GROUP_MISSING',
        `Item "${code}" cannot be created: Sub Group "${cleanText(fields.parent) || '(blank)'}" does not exist.`,
      );
    }
    const uom = await resolveMaster(MASTER_TYPES.UOM, fields.uomName, ctx);
    if (!uom?.id) {
      throw new ImportServiceError('UOM_MISSING', `Item "${code}" cannot be created: UOM "${cleanText(fields.uomName) || '(blank)'}" does not exist.`);
    }
    const hsn = await resolveMaster(MASTER_TYPES.HSN, fields.hsn, ctx);
    if (!hsn?.id) {
      throw new ImportServiceError('HSN_MISSING', `Item "${code}" cannot be created: HSN "${cleanText(fields.hsn) || '(blank)'}" does not exist.`);
    }

    const created = await create(Item, {
      businessId,
      name,
      itemCode: code,
      subGroupId: objectId(subGroupId),
      uomId: objectId(uom.id),
      hsnId: objectId(hsn.id),
      uniqueBarcode: cleanText(fields.uniqueBarcode) || 'No',
      itemType: cleanText(fields.itemType) || 'Simple',
      prefix: cleanText(fields.prefix),
      description: cleanText(fields.description),
      rsp: numberOrNull(fields.rsp),
      wsp: numberOrNull(fields.wsp),
    });
    const record = {
      id: String(created._id),
      code,
      name,
      subGroupId,
      uomId: uom.id,
      hsnId: hsn.id,
      uniqueBarcode: cleanText(created.uniqueBarcode),
    };
    rememberCreated(ctx, type, record);
    return { created: true, type, ...record };
  }

  throw new ImportServiceError('BAD_MASTER_TYPE', `Unknown master type ${type}.`);
}

/* ============================================================= execution === */

function newJobId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `BMI-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/* ------------------------------------------------------ mapping helpers --- */

function masterSearchRow(type, row, groupById) {
  const code = cleanText(row.code);
  const name = cleanText(row.name);
  return {
    id: String(row.id || ''),
    type,
    code,
    name,
    label: [code, name].filter(Boolean).join(' · ') || name || code,
    city: cleanText(row.city),
    zipCode: cleanText(row.zipCode),
    parentId: String(row.parentId || ''),
    parentName: type === MASTER_TYPES.SUB_GROUP
      ? cleanText(groupById.get(String(row.parentId || '')) || '')
      : '',
    contactTypeId: String(row.contactTypeId || ''),
  };
}

/* Search is deliberately server-side and index-backed: the browser never
   receives the whole master list, only the records matching what the operator
   typed. */
export async function searchImportMasters({ businessId, type, q = '', limit = 40 } = {}) {
  if (!MASTER_TYPE_LIST.includes(type)) {
    throw new ImportServiceError('BAD_MASTER_TYPE', 'Choose a valid Master Type.');
  }
  const references = await loadImportReferences({ businessId });
  const groupById = new Map(
    (references.index.lists?.[MASTER_TYPES.GROUP] || []).map((row) => [String(row.id), row.name]),
  );
  const needle = normalizeKey(q);
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const rows = (references.index.lists?.[type] || [])
    .filter((row) => {
      if (!needle) return true;
      return normalizeKey(row.code).includes(needle)
        || normalizeKey(row.name).includes(needle)
        || normalizeKey(row.city).includes(needle)
        || normalizeKey(row.zipCode).includes(needle);
    })
    .sort((a, b) => String(a.name || a.code || '').localeCompare(String(b.name || b.code || '')))
    .slice(0, safeLimit)
    .map((row) => masterSearchRow(type, row, groupById));

  return { type, count: rows.length, masters: rows };
}

function mappingAliasList(type, fields = {}, reference = {}) {
  const merged = { ...(reference.fields || {}), ...(fields || {}) };
  const aliases = masterReferenceAliases(type, merged);
  const add = (field, value) => {
    const text = cleanText(value);
    if (!text) return;
    if (aliases.some((alias) => normalizeKey(alias.value) === normalizeKey(text))) return;
    aliases.push({ field, value: text });
  };
  add(reference.field || 'value', reference.value);
  add('name', merged.name);
  add('code', merged.code);
  add('shortName', merged.shortName);
  return aliases;
}

function mappingParent(type, fields = {}, reference = {}, master = null, groupById = new Map()) {
  if (type !== MASTER_TYPES.SUB_GROUP) return '';
  return cleanText(reference.parent)
    || cleanText(fields.parent)
    || cleanText(master?.parent)
    || cleanText(groupById.get(String(master?.parentId || '')))
    || '';
}

function buildMappingRecord({
  type, fields, reference, master, user, aliases, key,
}) {
  const now = new Date().toISOString();
  const parent = cleanText(reference?.parent || fields?.parent);
  const value = cleanText(reference?.value || fields?.name || fields?.code || master?.name || master?.code);
  return {
    key: key || reference?.key || masterReferenceKey(type, { ...fields, parent }),
    type,
    field: cleanText(reference?.field),
    value,
    parent,
    fields: { ...(fields || {}) },
    aliases: aliases || mappingAliasList(type, fields, reference),
    masterId: String(master.id || master.masterId),
    masterCode: cleanText(master.code || master.masterCode),
    masterName: cleanText(master.name || master.masterName),
    mappedAt: now,
    mappedBy: cleanText(user?.name || user?.email || ''),
  };
}

/* Save the operator's explicit choices. A new choice replaces every earlier
   mapping that answered the same workbook value; it never leaves two
   contradictory answers behind. */
export function saveSessionMappings(options = {}) {
  return withSessionLock(options.token, () => saveSessionMappingsUnlocked(options));
}

async function saveSessionMappingsUnlocked({
  token, mappings = [], removeKeys = [], user,
} = {}) {
  const meta = await readImportSessionMeta(token);
  if (!Array.isArray(mappings) || (!mappings.length && !removeKeys.length)) {
    throw new ImportServiceError('NO_MAPPINGS', 'Choose at least one master to map.');
  }
  if (mappings.length > 200) {
    throw new ImportServiceError('TOO_MANY_MAPPINGS', 'Save at most 200 mappings at a time.');
  }

  const references = await loadImportReferences({ businessId: meta.businessId });
  const groupById = new Map(
    (references.index.lists?.[MASTER_TYPES.GROUP] || []).map((row) => [String(row.id), row.name]),
  );
  let saved = Array.isArray(meta.masterMappings) ? [...meta.masterMappings] : [];

  const removeSet = new Set((Array.isArray(removeKeys) ? removeKeys : []).map((key) => String(key || '')).filter(Boolean));
  if (removeSet.size) saved = saved.filter((mapping) => !removeSet.has(String(mapping.key || '')));

  for (const input of mappings) {
    const type = cleanText(input?.type);
    if (!MASTER_TYPE_LIST.includes(type)) {
      throw new ImportServiceError('BAD_MASTER_TYPE', 'Choose a valid Master Type for every mapping.');
    }
    const masterId = String(input?.masterId || '');
    if (!objectId(masterId)) {
      throw new ImportServiceError('MASTER_REQUIRED', `Choose the existing ${type} this value should use.`);
    }
    const master = (references.index.lists?.[type] || [])
      .find((row) => String(row.id) === masterId);
    if (!master) {
      throw new ImportServiceError(
        'MASTER_NOT_FOUND',
        `The selected ${type} no longer exists in this business. Re-open the search and choose it again.`,
        { status: 409 },
      );
    }

    const fields = { ...(input?.fields || {}) };
    if (!fields.name && !fields.code) fields.name = cleanText(input?.value);
    const reference = {
      key: cleanText(input?.key),
      value: cleanText(input?.value),
      field: cleanText(input?.field),
      parent: cleanText(input?.parent),
      fields,
    };
    const parent = mappingParent(type, fields, { ...reference, parent: input?.parent || fields.parent }, master, groupById);
    const aliases = mappingAliasList(type, fields, reference);
    const aliasKeys = new Set(
      aliases
        .map((alias) => masterMappingAliasKey(type, alias.value, parent))
        .filter(Boolean),
    );

    saved = saved.filter((existing) => {
      if (existing?.type !== type) return true;
      if (String(existing?.masterId) === masterId) return true;
      const existingParent = type === MASTER_TYPES.SUB_GROUP
        ? cleanText(existing.parent ?? existing.fields?.parent)
        : '';
      const existingAliases = Array.isArray(existing.aliases) && existing.aliases.length
        ? existing.aliases
        : masterReferenceAliases(type, existing.fields || { name: existing.value, code: existing.value });
      return !existingAliases.some((alias) => {
        const value = typeof alias === 'string' ? alias : alias?.value;
        return aliasKeys.has(masterMappingAliasKey(type, value, existingParent));
      });
    });

    saved.push(buildMappingRecord({
      type,
      fields,
      reference: { ...reference, parent },
      master,
      user,
      aliases,
      key: input?.key,
    }));
  }

  await updateImportSession(token, { masterMappings: saved });
  const analysis = await reanalyzeSession(token);
  return { mappings: analysis.masterMappings || saved, saved, analysis };
}


function sessionUser(session = {}) {
  return {
    id: session.id || null,
    name: session.name || '',
    email: session.email || '',
  };
}

async function createJob({ meta, strategy, replaceStock, user, fileName }) {
  const job = await HsrImportJob.create({
    jobId: newJobId(),
    businessId: objectId(meta.businessId),
    locationId: objectId(meta.locationId),
    operation: IMPORT_JOB_OPERATIONS[meta.scope],
    fileName: fileName || meta.fileName || '',
    fileHash: meta.fileHash || '',
    rowCount: 0,
    status: 'PENDING',
    finYear: meta.finYear || '',
    source: 'BARCODE_MASTER',
    scope: meta.scope,
    strategy: strategy || '',
    replaceStock: Boolean(replaceStock),
    userId: objectId(user?.id),
    userName: user?.name || '',
    userEmail: user?.email || '',
    dryRun: false,
  });
  return job;
}

function jobSummary(result) {
  return {
    total: result.total,
    /* `inserted` is the audit-trail name the HSR job history has always used;
       `created` is the name the import wizard shows. Both are returned so a
       caller can read either without guessing which run wrote the row. */
    inserted: result.created,
    created: result.created,
    updated: result.updated,
    replaced: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    mastersCreated: result.mastersCreated,
    mastersFailed: result.mastersFailed,
    recovered: result.recovered || 0,
  };
}

function planEntriesForScope(analysis, scope, strategy) {
  if (scope === IMPORT_SCOPES.BARCODE_STOCK) return [];
  if (strategy === IMPORT_STRATEGIES.EXISTING_ONLY) return [];
  return (analysis.missingMasters || []).filter((entry) => entry.creatable);
}

function sortPlanEntries(entries) {
  return [...entries].sort((a, b) => {
    const left = MASTER_CREATE_ORDER.indexOf(a.type);
    const right = MASTER_CREATE_ORDER.indexOf(b.type);
    return left - right;
  });
}

/* Create the masters the chosen strategy promises, in dependency order.
   A failed master blocks only the rows that need it - it never stops the
   remaining independent masters. */
async function createMastersFromAnalysis({ analysis, references, scope, strategy, businessId, user, onProgress }) {
  const empty = {
    created: [],
    existed: [],
    failed: [],
    ctx: null,
    index: references.index,
  };
  const entries = sortPlanEntries(planEntriesForScope(analysis, scope, strategy));
  if (!entries.length) return empty;

  const ctx = {
    businessId: objectId(businessId),
    index: references.index,
    taxes: references.taxes,
    session: null,
    created: {
      hsn: new Map(),
      uoms: new Map(),
      groups: new Map(),
      subGroups: new Map(),
      locations: new Map(),
      suppliers: new Map(),
      agents: new Map(),
      items: new Map(),
      contactTypes: new Map(),
    },
  };
  const out = { created: [], existed: [], failed: [], ctx, index: references.index };

  onProgress?.({
    type: 'progress',
    step: 'masters',
    done: 0,
    total: entries.length,
    message: `Creating ${entries.length} missing master${entries.length === 1 ? '' : 's'}…`,
  });

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    try {
      const result = await createMasterEntry({
        type: entry.type,
        fields: entry.fields,
        ctx,
      });
      if (result.created) out.created.push(result);
      else out.existed.push(result);
    } catch (err) {
      out.failed.push({
        type: entry.type,
        value: entry.value,
        message: err.message || 'The master could not be created.',
        code: err.code || '',
      });
    }
    onProgress?.({
      type: 'progress',
      step: 'masters',
      done: i + 1,
      total: entries.length,
      message: `${entry.type} ${entry.value || ''} ${out.failed.some((f) => f.value === entry.value) ? 'could not be created' : 'ready'}.`,
    });
  }

  return out;
}

/* Merged index after master creation: the database read at the start plus the
   rows this run created, so a barcode that was blocked by a missing item can
   be re-validated without re-reading half the database. */
function indexAfterMasters(references, created) {
  if (!created.length) return references.index;
  const raw = {
    suppliers: [...references.raw.suppliers],
    agents: [...references.raw.agents],
    items: [...references.raw.items],
    hsn: [...references.raw.hsn],
    groups: [...references.raw.groups],
    uoms: [...references.raw.uoms],
    locations: [...references.raw.locations],
    contactTypes: [...references.raw.contactTypes],
  };
  created.forEach((row) => {
    if (row.type === MASTER_TYPES.SUPPLIER) raw.suppliers.push({ id: row.id, contactId: row.code, businessName: row.name });
    else if (row.type === MASTER_TYPES.AGENT) raw.agents.push({ id: row.id, contactId: row.code, businessName: row.name });
    else if (row.type === MASTER_TYPES.ITEM) raw.items.push({
      id: row.id, name: row.name, code: row.code, subGroupId: row.subGroupId, uomId: row.uomId, hsnId: row.hsnId, uniqueBarcode: row.uniqueBarcode,
    });
    else if (row.type === MASTER_TYPES.HSN) raw.hsn.push({ id: row.id, code: row.code });
    else if (row.type === MASTER_TYPES.GROUP) raw.groups.push({ id: row.id, name: row.name, parentId: '' });
    else if (row.type === MASTER_TYPES.SUB_GROUP) raw.groups.push({ id: row.id, name: row.name, parentId: row.parentId || '' });
    else if (row.type === MASTER_TYPES.UOM) raw.uoms.push({ id: row.id, name: row.name, shortName: row.code });
    else if (row.type === MASTER_TYPES.LOCATION) raw.locations.push({ id: row.id, name: row.name });
  });
  return buildIndexFromRaw(raw);
}

function rowLocation(row, index, defaultLocation) {
  if (row.location?.id) return row.location;
  const name = cleanText(row.values.locationName);
  if (name) return lookupMasterCandidates(index, MASTER_TYPES.LOCATION, name).length === 1
    ? lookupMaster(index, MASTER_TYPES.LOCATION, name)
    : null;
  return defaultLocation;
}

function rowItem(row, index) {
  return row.item || lookupMaster(index, MASTER_TYPES.ITEM, row.values.itemCode);
}

function rowSupplier(row, index) {
  return row.supplier
    || lookupMaster(index, MASTER_TYPES.SUPPLIER, row.values.supplierCode)
    || lookupMaster(index, MASTER_TYPES.SUPPLIER, row.values.supplierName);
}

function rowAgent(row, index) {
  return row.agent
    || lookupMaster(index, MASTER_TYPES.AGENT, row.values.agentCode)
    || lookupMaster(index, MASTER_TYPES.AGENT, row.values.agentName);
}

function decimalText(value) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

/* The barcode row a workbook line becomes. Pure - no writes, no lookups
   beyond the resolved masters - so a test can assert every mapped field. */
export function buildBarcodeFields({
  row,
  item,
  supplier,
  agent,
  location,
  businessId,
  finYear = '',
  fileHash = '',
  jobId = '',
  uom = '',
}) {
  const values = row.values || {};
  const openingQty = numberOrNull(values.openingQty);
  const qty = openingQty === null ? 0 : openingQty;
  const batchType = batchTypeOf(values.batchUnique || item?.uniqueBarcode || 'No');
  const uomText = cleanText(uom) || cleanText(values.uomName);
  const clientRowId = `${fileHash || jobId}:${row.rowNumber}`.slice(0, 180);

  const customFields = {};
  if (cleanText(values.itemAttributes)) customFields.itemAttributes = cleanText(values.itemAttributes);
  if (cleanText(values.supplierInvoiceNo)) customFields.supplierInvoiceNo = cleanText(values.supplierInvoiceNo);
  if (cleanText(values.businessName)) customFields.businessName = cleanText(values.businessName);

  return {
    grcId: '',
    grcNo: cleanText(values.grcNo),
    supplierId: supplier?.id ? String(supplier.id) : '',
    groupId: cleanText(item?.subGroupId),
    oldBarcode: cleanText(values.oldBarcode),
    itemCode: cleanText(item?.code) || cleanText(values.itemCode),
    itemId: item?.id ? objectId(item.id) : null,
    itemName: cleanText(item?.name) || cleanText(values.itemName),
    batchUnique: batchType,
    batchType,
    billSlNo: cleanText(values.serialNo),
    seq: cleanText(values.serialNo),
    supplierDescription: cleanText(values.itemAttributes),
    qty: String(qty),
    qtyNum: qty,
    openingQty: qty,
    uom: uomText,
    uomId: item?.uomId ? objectId(item.uomId) : null,
    uomType: uomTypeOf(uomText),
    hsn: cleanText(values.hsn),
    purRate: decimalText(values.purRate),
    disc: decimalText(values.disc),
    finalNet: decimalText(values.finalNet),
    gst: decimalText(values.gst),
    printDescription: cleanText(values.printDescription) || cleanText(item?.name) || cleanText(values.itemName),
    retailPrice: decimalText(values.retailPrice),
    disc2: decimalText(values.disc2),
    offerPrice: decimalText(values.offerPrice),
    wspPrice: decimalText(values.wspPrice),
    dpPrice: decimalText(values.dpPrice),
    hsrPurPrice: numberOrNull(values.purRate) || 0,
    stockDate: toDateOrNull(values.stockDate),
    stockAge: values.age ?? null,
    batchNo: cleanText(values.batchNo),
    serialNo: cleanText(values.serialNo),
    barcodeNo: cleanText(values.barcodeNo),
    businessId: String(businessId),
    locationId: location?.id ? String(location.id) : '',
    currentBusinessId: objectId(businessId),
    currentLocationId: location?.id ? objectId(location.id) : null,
    finYear,
    status: BARCODE_STATUS.IN_STOCK,
    clientRowId,
    customFields,
    source: SOURCE,
    sourcePayload: JSON.stringify(values).slice(0, 6000),
  };
}

class DuplicateBarcodeError extends Error {
  constructor(barcodeNo) {
    super(`Barcode ${barcodeNo} already exists in this business. It was skipped instead of being created twice.`);
    this.name = 'DuplicateBarcodeError';
    this.code = 'DUPLICATE_BARCODE';
    this.barcodeNo = barcodeNo;
  }
}

function queryOptions(session) {
  return session ? { session } : {};
}

async function duplicateBarcodeNumber({ businessId, barcodeNo, session, ignoreClientRowId = '' }) {
  const number = cleanText(barcodeNo);
  if (!number) return '';
  const filter = { businessId: String(businessId), barcodeNo: number };
  if (ignoreClientRowId) filter.clientRowId = { $ne: ignoreClientRowId };
  let query = BarcodeLabel.findOne(filter).select('barcodeNo').lean();
  if (session) query = query.session(session);
  const clash = await query;
  return clash?.barcodeNo || '';
}

/* Open the stock of freshly inserted barcode rows. Split by resolved location
   because applyMovement takes one `set`/movement pair per call. The caller
   supplies the session, so on a replica set the insert and every GRC_IN ledger
   row commit or roll back together. */
async function openImportedStock({
  units, businessId, meta, job, user, session,
}) {
  const byLocation = new Map();
  units.forEach(({ doc, locationId }) => {
    const key = String(locationId || doc.currentLocationId || '');
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(doc);
  });

  let movedCount = 0;
  const skipped = [];
  for (const [targetLocation, group] of byLocation) {
    if (!targetLocation) {
      skipped.push(...group);
      continue;
    }
    const moved = await applyMovement({
      units: group,
      expect: null,
      set: {
        status: BARCODE_STATUS.IN_STOCK,
        currentLocationId: objectId(targetLocation),
        currentBusinessId: objectId(businessId),
        currentStockPointId: null,
      },
      movement: {
        type: MOVEMENT_TYPES.GRC_IN,
        direction: 'in',
        toLocationId: objectId(targetLocation),
        refModel: MOVEMENT_REF_MODEL,
        refNo: meta.fileName || job.fileName || job.jobId,
        reason: 'Opening stock created by Barcode + Master Data import',
        at: new Date(),
      },
      user,
      session,
      strict: false,
    });
    movedCount += moved.moved.length;
    skipped.push(...moved.skipped);
  }
  return { movedCount, skipped };
}

/* A barcode row that was written by an earlier attempt but never got its
   GRC_IN ledger row (the old implementation inserted first and moved stock
   afterwards). Opening the stock now keeps the row and the ledger in step;
   the movement is only written when none exists, so a real retry is a no-op. */
async function recoverImportedRow({
  written, businessId, meta, job, user, locationId,
}) {
  const ledger = await StockMovement.findOne({
    barcodeId: written._id,
    type: MOVEMENT_TYPES.GRC_IN,
  }).select('_id').lean();
  if (ledger) return { ok: true, recovered: false };

  const targetLocation = written.currentLocationId || written.locationId || locationId;
  if (!targetLocation) {
    return { ok: false, message: 'The barcode exists but it has no location to open its stock at.' };
  }

  try {
    const moved = await applyMovement({
      units: [written],
      expect: null,
      set: {
        status: BARCODE_STATUS.IN_STOCK,
        currentLocationId: objectId(targetLocation),
        currentBusinessId: objectId(businessId),
        currentStockPointId: null,
      },
      movement: {
        type: MOVEMENT_TYPES.GRC_IN,
        direction: 'in',
        toLocationId: objectId(targetLocation),
        refModel: MOVEMENT_REF_MODEL,
        refNo: meta.fileName || job.fileName || job.jobId,
        reason: 'Opening stock completed for an earlier Barcode + Master Data attempt',
        at: new Date(),
      },
      user,
      strict: false,
    });
    if (!moved.moved.length) {
      return { ok: false, message: 'The barcode row exists but its stock movement could not be recorded.' };
    }
    return { ok: true, recovered: true };
  } catch (err) {
    return { ok: false, message: err?.message || 'The stock movement could not be recovered.' };
  }
}

/* One row, one transaction. Used only when a whole chunk could not commit, so
   one bad barcode cannot fail its neighbours. */
async function importOneBarcode({
  entry, businessId, meta, job, user,
}) {
  const { row, fields, doc, locationId } = entry;
  const alreadyWritten = await BarcodeLabel.findOne({
    businessId: String(businessId),
    clientRowId: fields.clientRowId,
  }).lean();
  if (alreadyWritten) {
    const recovery = await recoverImportedRow({
      written: alreadyWritten, businessId, meta, job, user, locationId,
    });
    return recovery.ok
      ? { outcome: 'created', recovered: recovery.recovered }
      : { outcome: 'failed', message: recovery.message };
  }

  try {
    await withTransaction(async (session) => {
      const clash = await duplicateBarcodeNumber({
        businessId,
        barcodeNo: fields.barcodeNo,
        session,
        ignoreClientRowId: fields.clientRowId,
      });
      if (clash) throw new DuplicateBarcodeError(clash);

      const inserted = await BarcodeLabel.insertMany([doc], { ...queryOptions(session), ordered: true });
      const moved = await openImportedStock({
        units: [{ doc: inserted[0], locationId }],
        businessId,
        meta,
        job,
        user,
        session,
      });
      if (moved.skipped.length) {
        throw new Error('The barcode row was written but its stock movement could not be recorded.');
      }
    });
    return { outcome: 'created', recovered: false };
  } catch (err) {
    if (err?.code === 'DUPLICATE_BARCODE') {
      return { outcome: 'skipped', message: err.message };
    }

    /* Without transaction support the insert can land even though the movement
       failed. Re-read by the deterministic id and finish the job instead of
       reporting a failure that would create the row twice on retry. */
    const landed = await BarcodeLabel.findOne({
      businessId: String(businessId),
      clientRowId: fields.clientRowId,
    }).lean();
    if (!landed) return { outcome: 'failed', message: err?.message || 'The barcode row could not be written.' };

    const recovery = await recoverImportedRow({
      written: landed, businessId, meta, job, user, locationId,
    });
    return recovery.ok
      ? { outcome: 'created', recovered: recovery.recovered }
      : { outcome: 'failed', message: recovery.message };
  }
}

async function importBarcodeRows({
  analysis,
  strategy,
  references,
  index,
  meta,
  job,
  user,
  defaultLocation,
  onProgress,
}) {
  const rows = (analysis.barcode.rows || []).filter((row) => {
    const action = row.actions?.[strategy];
    return action === 'import';
  });

  const result = {
    created: 0, skipped: 0, failed: 0, total: rows.length, failures: [], retried: 0, recovered: 0,
  };
  if (!rows.length) return result;

  const businessId = objectId(meta.businessId);
  const locationId = objectId(meta.locationId);
  const fileKey = meta.fileHash || job.jobId;
  const uomNameById = new Map([
    ...references.raw.uoms.map((row) => [row.id, row.name]),
    ...(index.lists?.[MASTER_TYPES.UOM] || []).map((row) => [row.id, row.name]),
  ]);

  const recordFailure = (row, fields, message) => {
    result.failed += 1;
    result.failures.push({
      rowNumber: row?.rowNumber,
      barcodeNo: fields?.barcodeNo || cleanText(row?.values?.barcodeNo),
      itemCode: fields?.itemCode || cleanText(row?.values?.itemCode),
      message,
      status: 'FAILED',
    });
  };

  onProgress?.({
    type: 'progress',
    step: 'barcodes',
    done: 0,
    total: rows.length,
    message: `Writing ${rows.length} new barcode${rows.length === 1 ? '' : 's'}…`,
  });

  for (let offset = 0; offset < rows.length; offset += BARCODE_CHUNK) {
    const chunk = rows.slice(offset, offset + BARCODE_CHUNK);
    const entries = chunk.map((row) => ({
      row,
      clientRowId: `${fileKey}:${row.rowNumber}`.slice(0, 180),
    }));

    /* A retried import must not insert a row this file already wrote, and a
       barcode that appeared after the preview must not be duplicated. Both
       are read from the database, not from the browser. */
    const [already, numberClash] = await Promise.all([
      BarcodeLabel.find({
        businessId: String(businessId),
        clientRowId: { $in: entries.map((entry) => entry.clientRowId) },
      }).lean(),
      BarcodeLabel.find({
        businessId: String(businessId),
        barcodeNo: { $in: chunk.map((row) => cleanText(row.values.barcodeNo)).filter(Boolean) },
      }).select('barcodeNo').lean(),
    ]);
    const alreadyByClientId = new Map(already.map((written) => [written.clientRowId, written]));
    const existingNumbers = new Set(numberClash.map((written) => written.barcodeNo));

    const attempted = [];
    for (const entry of entries) {
      const { row, clientRowId } = entry;
      const barcodeNo = cleanText(row.values.barcodeNo);

      if (alreadyByClientId.has(clientRowId)) {
        const written = alreadyByClientId.get(clientRowId);
        const recovery = await recoverImportedRow({
          written, businessId, meta, job, user, locationId: written.currentLocationId || locationId,
        });
        result.skipped += 1;
        result.retried += 1;
        if (recovery.recovered) result.recovered += 1;
        if (!recovery.ok) {
          result.failed += 1;
          result.failures.push({
            rowNumber: row.rowNumber,
            barcodeNo: written.barcodeNo || barcodeNo,
            itemCode: written.itemCode || cleanText(row.values.itemCode),
            message: recovery.message,
            status: 'FAILED',
          });
        }
        continue;
      }

      if (existingNumbers.has(barcodeNo)) {
        result.skipped += 1;
        result.failures.push({
          rowNumber: row.rowNumber,
          barcodeNo,
          itemCode: cleanText(row.values.itemCode),
          message: `Barcode ${barcodeNo} already exists in this business. It was skipped to avoid creating a duplicate.`,
          status: 'SKIPPED',
        });
        continue;
      }

      const item = rowItem(row, index);
      if (!item) {
        recordFailure(row, null, 'The item could not be resolved at execution time.');
        continue;
      }
      const resolvedLocation = rowLocation(row, index, defaultLocation)
        || (defaultLocation ? defaultLocation : { id: String(locationId), name: '' });
      const supplier = rowSupplier(row, index);
      const agent = rowAgent(row, index);
      const uom = uomNameById.get(item.uomId) || cleanText(row.values.uomName) || '';
      const fields = buildBarcodeFields({
        row,
        item,
        supplier,
        agent,
        location: resolvedLocation,
        businessId,
        finYear: meta.finYear,
        fileHash: fileKey,
        jobId: job.jobId,
        uom,
      });
      if (!fields.locationId) {
        recordFailure(row, fields, 'No location could be resolved for this row, so its stock cannot be opened.');
        continue;
      }
      const doc = new BarcodeLabel(fields);
      const validation = doc.validateSync();
      if (validation) {
        recordFailure(
          row,
          fields,
          Object.values(validation.errors || {}).map((error) => error.message).join('; ')
            || 'The row did not pass the barcode schema.',
        );
        continue;
      }
      attempted.push({ row, fields, doc, locationId: fields.locationId });
    }

    if (!attempted.length) {
      onProgress?.({
        type: 'progress',
        step: 'barcodes',
        done: Math.min(offset + chunk.length, rows.length),
        total: rows.length,
        message: `${Math.min(offset + chunk.length, rows.length)} of ${rows.length} rows checked.`,
      });
      continue;
    }

    /* One transaction per chunk: every barcode row and its GRC_IN movement
       commit together. On MongoDB without transactions withTransaction runs
       the same callback without a session, and the per-row recovery below
       finishes any insert whose movement did not make it. */
    let committed = false;
    try {
      await withTransaction(async (session) => {
        const numbers = attempted.map((entry) => entry.fields.barcodeNo).filter(Boolean);
        if (numbers.length) {
          let clashQuery = BarcodeLabel.findOne({
            businessId: String(businessId),
            barcodeNo: { $in: numbers },
          }).select('barcodeNo').lean();
          if (session) clashQuery = clashQuery.session(session);
          const clash = await clashQuery;
          if (clash?.barcodeNo) throw new DuplicateBarcodeError(clash.barcodeNo);
        }

        const inserted = await BarcodeLabel.insertMany(
          attempted.map((entry) => entry.doc),
          { ...queryOptions(session), ordered: true },
        );
        const units = inserted.map((written, i) => ({
          doc: written,
          locationId: attempted[i].fields.locationId,
        }));
        const moved = await openImportedStock({
          units, businessId, meta, job, user, session,
        });
        if (moved.skipped.length) {
          throw new Error('One or more barcode rows could not have their stock opened.');
        }
      });
      committed = true;
    } catch {
      /* Fall through: isolate the rows instead of failing the chunk. This
         also covers a chunk whose insert landed before a movement failed. */
    }

    if (committed) {
      result.created += attempted.length;
    } else {
      for (const entry of attempted) {
        const outcome = await importOneBarcode({
          entry, businessId, meta, job, user,
        });
        if (outcome.outcome === 'created') {
          result.created += 1;
          if (outcome.recovered) result.recovered += 1;
        } else if (outcome.outcome === 'skipped') {
          result.skipped += 1;
          result.failures.push({
            rowNumber: entry.row.rowNumber,
            barcodeNo: entry.fields.barcodeNo,
            itemCode: entry.fields.itemCode,
            message: outcome.message,
            status: 'SKIPPED',
          });
        } else {
          recordFailure(entry.row, entry.fields, outcome.message);
        }
      }
    }

    onProgress?.({
      type: 'progress',
      step: 'barcodes',
      done: Math.min(offset + chunk.length, rows.length),
      total: rows.length,
      message: `${Math.min(offset + chunk.length, rows.length)} of ${rows.length} rows — ${result.created} created, ${result.failed} failed.`,
    });
  }

  return result;
}

async function updateBarcodeStock({
  analysis,
  meta,
  job,
  user,
  onProgress,
}) {
  const rows = (analysis.barcode.rows || []).filter((row) => row.actions?.[IMPORT_STRATEGIES.UPDATE_STOCK] === 'update');
  const result = { created: 0, updated: 0, skipped: 0, failed: 0, total: rows.length, failures: [] };
  if (!rows.length) return result;

  const businessId = objectId(meta.businessId);
  onProgress?.({
    type: 'progress',
    step: 'stock',
    done: 0,
    total: rows.length,
    message: `Replacing stock on ${rows.length} existing barcode${rows.length === 1 ? '' : 's'}…`,
  });

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const barcodeNo = cleanText(row.values.barcodeNo);
    const newQty = numberOrNull(row.values.openingQty);
    try {
      const existing = await BarcodeLabel.findOne({
        _id: objectId(row.existingBarcode?.id),
        status: BARCODE_STATUS.IN_STOCK,
      }).lean();
      if (!existing) {
        result.failed += 1;
        result.failures.push({
          rowNumber: row.rowNumber,
          barcodeNo,
          itemCode: cleanText(row.existingBarcode?.itemCode),
          message: 'The barcode changed since the preview (it is no longer in stock). Nothing was written.',
        });
        continue;
      }

      const currentQty = Number(existing.qtyNum ?? existing.qty ?? 0) || 0;
      if (newQty === null) {
        result.failed += 1;
        result.failures.push({ rowNumber: row.rowNumber, barcodeNo, itemCode: existing.itemCode, message: 'Opening Quantity is required for a stock update.' });
        continue;
      }
      if (currentQty === newQty) {
        result.skipped += 1;
        continue;
      }

      const delta = newQty - currentQty;
      const isIn = delta > 0;
      const unit = {
        ...existing,
        qtyNum: Math.abs(delta),
        barcodeNo: existing.barcodeNo || barcodeNo,
      };

      const moved = await withTransaction(async (session) => applyMovement({
        units: [unit],
        expect: BARCODE_STATUS.IN_STOCK,
        set: {
          qty: String(newQty),
          qtyNum: newQty,
          openingQty: newQty,
        },
        movement: {
          type: isIn ? MOVEMENT_TYPES.ADJUST_IN : MOVEMENT_TYPES.ADJUST_OUT,
          direction: isIn ? 'in' : 'out',
          fromLocationId: isIn ? null : existing.currentLocationId,
          toLocationId: isIn ? existing.currentLocationId : null,
          refModel: MOVEMENT_REF_MODEL,
          refNo: meta.fileName || job.fileName || job.jobId,
          reason: 'Stock replaced by Barcode / Stock Update import',
          at: new Date(),
        },
        user,
        session,
        strict: false,
      }));

      if (moved.moved.length) {
        result.updated += 1;
      } else {
        result.failed += 1;
        result.failures.push({
          rowNumber: row.rowNumber,
          barcodeNo,
          itemCode: existing.itemCode,
          message: 'Another user changed this barcode before the replacement could be written. Nothing was changed for it.',
        });
      }
    } catch (err) {
      result.failed += 1;
      result.failures.push({
        rowNumber: row.rowNumber,
        barcodeNo,
        itemCode: cleanText(row.existingBarcode?.itemCode),
        message: err?.message || 'The stock replacement could not be written.',
      });
    }

    if (i % 25 === 0 || i === rows.length - 1) {
      onProgress?.({
        type: 'progress',
        step: 'stock',
        done: i + 1,
        total: rows.length,
        message: `${i + 1} of ${rows.length} rows — ${result.updated} updated, ${result.failed} failed.`,
      });
    }
  }

  return result;
}

async function createMastersOnly({ analysis, references, meta, user, onProgress }) {
  return createMastersFromAnalysis({
    analysis,
    references,
    scope: IMPORT_SCOPES.MASTER_DATA,
    strategy: IMPORT_STRATEGIES.CREATE_AND_IMPORT,
    businessId: meta.businessId,
    user,
    onProgress,
  });
}

/* Execute the stored workbook. Everything is re-read and re-validated here:
   the preview is advice, this function is the decision. */
export async function executeImportSession({
  token,
  strategy,
  replaceStock = false,
  user,
  onProgress,
} = {}) {
  const meta = await readImportSessionMeta(token);
  if (!meta.businessId) throw new ImportServiceError('BUSINESS_REQUIRED', 'This import session has no business.');
  if (!meta.locationId) throw new ImportServiceError('LOCATION_REQUIRED', 'This import session has no location.');

  const scope = meta.scope;
  if (!Object.values(IMPORT_SCOPES).includes(scope)) {
    throw new ImportServiceError('BAD_SCOPE', 'This import session has an unknown import type.');
  }

  const allowed = STRATEGIES_BY_SCOPE[scope] || [];
  const chosen = scope === IMPORT_SCOPES.MASTER_DATA ? IMPORT_STRATEGIES.CREATE_AND_IMPORT : strategy;
  if (scope !== IMPORT_SCOPES.MASTER_DATA && !allowed.includes(chosen)) {
    throw new ImportServiceError('BAD_STRATEGY', 'Choose one of the strategies offered for this import type.');
  }
  if (scope === IMPORT_SCOPES.BARCODE_STOCK && replaceStock !== true) {
    throw new ImportServiceError(
      'REPLACE_NOT_CONFIRMED',
      'Tick "Replace existing stock quantities" before running a stock update. Nothing has been changed.',
    );
  }

  const buffer = await readImportSessionWorkbook(token);
  const fileName = meta.fileName || 'barcode-import.xlsx';

  const first = await analyzeWorkbookBuffer({
    buffer,
    fileName,
    scope,
    businessId: meta.businessId,
    locationId: meta.locationId,
    masterMappings: Array.isArray(meta.masterMappings) ? meta.masterMappings : [],
  });

  /* A mapping that points at a deleted record, or a value that still matches
     several masters, is a decision only the operator can make. Refuse before
     creating a job or writing a master, so a half-resolved workbook cannot
     leave stock changes behind. */
  if (scope === IMPORT_SCOPES.BARCODE_MASTER) {
    const blockers = (first.analysis.missingMasters || []).filter((entry) => (
      entry.resolution === 'ambiguous' || entry.resolution === 'mapping_error'
    ));
    if (blockers.length) {
      const firstBlocker = blockers[0];
      throw new ImportServiceError(
        'RESOLUTION_REQUIRED',
        `${blockers.length} master reference(s) still need a decision. ${firstBlocker.type} "${firstBlocker.value || '(blank)'}": ${firstBlocker.blockedReason || firstBlocker.reason || 'choose the correct master first.'}`,
        { status: 409, blockers: blockers.slice(0, 20) },
      );
    }
  }

  const job = await createJob({ meta, strategy: chosen, replaceStock, user, fileName });
  await HsrImportJob.updateOne(
    { _id: job._id },
    { $set: { status: 'RUNNING', startedAt: new Date(), rowCount: first.analysis.barcode.rows.length + first.analysis.master.rows.length } },
  );

  const result = {
    strategy: chosen,
    scope,
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    mastersCreated: 0,
    mastersFailed: 0,
    failures: [],
  };
  const actor = sessionUser(user);
  let effectiveAnalysis = first.analysis;

  onProgress?.({ type: 'start', jobId: job.jobId, scope, strategy: chosen, fileName });

  try {
    if (scope === IMPORT_SCOPES.BARCODE_STOCK) {
      const stock = await updateBarcodeStock({
        analysis: first.analysis,
        meta,
        job,
        user: actor,
        onProgress,
      });
      result.total = first.analysis.barcode.rows.length;
      result.updated = stock.updated;
      result.skipped = stock.skipped;
      result.failed = stock.failed;
      stock.failures.forEach((line) => result.failures.push(line));
    } else {
      /* Masters first, then re-validate. This is what makes "create missing
         masters + import barcodes" one coherent run: a barcode that pointed
         at a master this run just created is unlocked by the second pass. */
      const masters = scope === IMPORT_SCOPES.MASTER_DATA
        ? await createMastersOnly({ analysis: first.analysis, references: first.references, meta, user: actor, onProgress })
        : await createMastersFromAnalysis({
          analysis: first.analysis,
          references: first.references,
          scope,
          strategy: chosen,
          businessId: meta.businessId,
          user: actor,
          onProgress,
        });

      result.mastersCreated = masters.created.length;
      result.mastersFailed = masters.failed.length;
      masters.failed.forEach((line) => result.failures.push({
        rowNumber: '',
        barcodeNo: '',
        itemCode: '',
        masterType: line.type,
        masterValue: line.value,
        message: line.message,
      }));

      if (scope === IMPORT_SCOPES.MASTER_DATA) {
        result.total = first.analysis.master.rows.length;
        result.created = 0;
        result.skipped = masters.existed.length + (first.analysis.master.rows.filter((row) => row.status === 'ignored').length);
        result.failed = result.failed + first.analysis.master.rows.filter((row) => row.status === 'invalid').length;
      } else {
        const freshIndex = indexAfterMasters(first.references, masters.existed.concat(masters.created));
        let secondAnalysis = first.analysis;
        try {
          const { values } = extractBarcodeValues({ buffer, scope });
          const existingBarcodes = await loadExistingBarcodes({
            businessId: meta.businessId,
            values,
            locationNameById: new Map(first.references.raw.locations.map((row) => [row.id, row.name])),
          });
          secondAnalysis = analyzeImport({
            buffer,
            scope,
            fileName,
            masterIndex: freshIndex,
            existingBarcodes,
            defaultLocation: first.references.locations.find((row) => String(row.id) === String(meta.locationId)) || null,
            masterMappings: Array.isArray(meta.masterMappings) ? meta.masterMappings : [],
            business: first.references.raw.business || null,
          });
        } catch {
          /* A re-read failure must not throw away the masters that were
             created; fall back to the first analysis and let the row checks
             below report whatever cannot be resolved. */
          secondAnalysis = first.analysis;
        }

        result.total = secondAnalysis.barcode.rows.length;
        result.created = 0;
        effectiveAnalysis = secondAnalysis;
        const imported = await importBarcodeRows({
          analysis: secondAnalysis,
          strategy: chosen,
          references: first.references,
          index: freshIndex,
          meta,
          job,
          user: actor,
          defaultLocation: first.references.locations.find((row) => String(row.id) === String(meta.locationId)) || null,
          onProgress,
        });
        result.created = imported.created;
        result.skipped += imported.skipped;
        result.failed += imported.failed;
        imported.failures.forEach((line) => result.failures.push(line));
      }
    }

    /* Rows the strategy deliberately skipped are counted, so "import 100
       lines, create 3" adds up instead of looking as if 97 vanished. Count
       from the FINAL validation: a row blocked before its master existed is
       imported after the master is created, not reported as a failure. */
    if (scope !== IMPORT_SCOPES.MASTER_DATA) {
      const analyzedRows = effectiveAnalysis.barcode.rows || [];
      const skippedByPlan = analyzedRows.filter((row) => row.actions?.[chosen] === 'skip').length;
      const blockedByPlan = analyzedRows.filter((row) => row.actions?.[chosen] === 'blocked').length;
      result.skipped += skippedByPlan;
      result.failed += blockedByPlan;
    }

    const status = result.failed > 0
      ? (result.created + result.updated + result.mastersCreated > 0 ? 'PARTIAL' : 'FAILED')
      : 'COMPLETED';

    await HsrImportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status,
          completedAt: new Date(),
          result: jobSummary(result),
          errors: result.failures.slice(0, ERROR_LIMIT),
          warnings: first.analysis.warnings || [],
        },
      },
    );

    const execution = {
      jobId: job.jobId,
      status,
      strategy: chosen,
      scope,
      replaceStock: Boolean(replaceStock),
      finishedAt: new Date().toISOString(),
      result: {
        ...jobSummary(result),
        failures: result.failures.slice(0, ERROR_LIMIT),
        failuresTotal: result.failures.length,
      },
    };
    await updateImportSession(token, { execution, analysis: effectiveAnalysis });

    onProgress?.({ type: 'done', jobId: job.jobId, status, result: execution.result });
    return { ok: true, jobId: job.jobId, status, result: execution.result };
  } catch (err) {
    await HsrImportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'FAILED',
          completedAt: new Date(),
          result: jobSummary(result),
          errors: [{ message: err?.message || 'The import failed.', code: err?.code || '' }],
        },
      },
    );
    onProgress?.({ type: 'error', jobId: job.jobId, error: err?.message || 'The import failed.' });
    throw err;
  }
}

/* ====================================================== session helpers === */

export async function createSessionFromWorkbook({
  buffer,
  fileName,
  scope,
  businessId,
  locationId,
  finYear = '',
  user = {},
} = {}) {
  const { analysis, references } = await analyzeWorkbookBuffer({
    buffer,
    fileName,
    scope,
    businessId,
    locationId,
  });
  const fileHash = hashBuffer(buffer);
  const meta = await createImportSession({
    buffer,
    fileName,
    scope,
    businessId,
    locationId,
    finYear,
    userId: user.id || '',
    userName: user.name || '',
    userEmail: user.email || '',
    fileHash,
    analysis,
  });
  return { token: meta.token, analysis, reference: references.reference, fileHash };
}

export async function reanalyzeSession(token) {
  const meta = await readImportSessionMeta(token);
  const buffer = await readImportSessionWorkbook(token);
  const { analysis } = await analyzeWorkbookBuffer({
    buffer,
    fileName: meta.fileName,
    scope: meta.scope,
    businessId: meta.businessId,
    locationId: meta.locationId,
    masterMappings: Array.isArray(meta.masterMappings) ? meta.masterMappings : [],
  });
  await updateImportSession(token, { analysis });
  return analysis;
}

/* The in-page "Create master" dialog. Same validators and same writer as the
   workbook, so a master typed here cannot be looser than one in Excel. */
export function createSessionMasters(options = {}) {
  return withSessionLock(options.token, () => createSessionMastersUnlocked(options));
}

async function createSessionMastersUnlocked({ token, masters = [], user } = {}) {
  const meta = await readImportSessionMeta(token);
  if (!Array.isArray(masters) || !masters.length) {
    throw new ImportServiceError('NO_MASTERS', 'Add at least one master to create.');
  }
  if (masters.length > 100) {
    throw new ImportServiceError('TOO_MANY_MASTERS', 'Create at most 100 masters at a time.');
  }

  const references = await loadImportReferences({ businessId: meta.businessId });
  const ctx = {
    businessId: objectId(meta.businessId),
    index: references.index,
    taxes: references.taxes,
    session: null,
    created: {
      hsn: new Map(),
      uoms: new Map(),
      groups: new Map(),
      subGroups: new Map(),
      locations: new Map(),
      suppliers: new Map(),
      agents: new Map(),
      items: new Map(),
      contactTypes: new Map(),
    },
  };

  const created = [];
  const failed = [];
  const mappingInputs = [];
  const ordered = [...masters].sort((a, b) => {
    const left = MASTER_CREATE_ORDER.indexOf(a.type);
    const right = MASTER_CREATE_ORDER.indexOf(b.type);
    return left - right;
  });

  for (const master of ordered) {
    const type = master.type;
    if (!MASTER_TYPE_LIST.includes(type)) {
      failed.push({ type, value: '', message: 'Choose a valid Master Type.' });
      continue;
    }
    const values = master.values || {};
    const validation = validateMasterValues(type, values);
    if (validation.errors.length) {
      failed.push({
        type,
        value: cleanText(values?.name || values?.code),
        message: validation.errors.map((error) => error.message).join(' '),
      });
      continue;
    }
    try {
      const result = await createMasterEntry({ type, fields: values, ctx });
      created.push(result);
      const reference = {
        key: cleanText(master.reference?.key),
        value: cleanText(master.reference?.value || values.name || values.code),
        field: cleanText(master.reference?.field),
        parent: cleanText(master.reference?.parent || values.parent),
        fields: { ...(master.reference?.fields || values) },
      };
      mappingInputs.push({
        type,
        masterId: result.id,
        value: reference.value,
        field: reference.field,
        parent: reference.parent,
        fields: reference.fields,
        key: reference.key || masterReferenceKey(type, reference.fields),
      });
    } catch (err) {
      failed.push({
        type,
        value: cleanText(values?.name || values?.code),
        message: err?.message || 'The master could not be created.',
      });
    }
  }

  /* Record the real IDs this session created so a page refresh can still show
     Created against the master, not only against the workbook value. */
  const previousMeta = await readImportSessionMeta(token);
  const creations = [
    ...(Array.isArray(previousMeta.masterCreations) ? previousMeta.masterCreations : []),
    ...created.map((entry) => ({
      type: entry.type,
      id: entry.id,
      code: entry.code || '',
      name: entry.name || '',
      created: Boolean(entry.created),
      existed: Boolean(entry.existed),
      at: new Date().toISOString(),
      by: cleanText(user?.name || user?.email || ''),
    })),
  ];
  await updateImportSession(token, { masterCreations: creations });

  let analysis;
  if (mappingInputs.length) {
    /* Already inside this token's lock; call the unlocked body directly. */
    const mapped = await saveSessionMappingsUnlocked({
      token,
      mappings: mappingInputs,
      user,
    });
    analysis = mapped.analysis;
  } else {
    analysis = await reanalyzeSession(token);
  }
  return { created, failed, analysis, user: user?.name || '' };
}

export async function getSessionErrorWorkbook(token) {
  const meta = await readImportSessionMeta(token);
  if (!meta.analysis) throw new ImportServiceError('NO_ANALYSIS', 'This import session has no analysis.');
  const executionFailures = (meta.execution?.result?.failures || []).map((line) => ({
    rowNumber: line.rowNumber,
    barcodeNo: line.barcodeNo,
    itemCode: line.itemCode,
    masterType: line.masterType,
    masterValue: line.masterValue,
    message: line.message,
    status: 'Failed during import',
  }));
  return buildErrorWorkbook({ analysis: meta.analysis, extraRows: executionFailures, generatedAt: new Date() });
}

/* The upload response: everything the wizard needs to draw the summary,
   without shipping every parsed row back. The rows are fetched page by page
   from the stored session. */
export function analysisOverview(analysis) {
  if (!analysis) return null;
  return {
    ...analysis,
    barcode: { ...analysis.barcode, rows: [] },
    master: { ...analysis.master, rows: [] },
  };
}

/* A compact preview payload: the full row array stays on the server. */
export function sessionPreview(meta, { sheet = 'barcode', filter = 'all', page = 1, perPage = 50, strategy } = {}) {
  const analysis = meta.analysis || {};
  const target = sheet === 'master' ? analysis.master : analysis.barcode;
  const rows = Array.isArray(target?.rows) ? target.rows : [];
  const chosen = strategy
    || (meta.scope === IMPORT_SCOPES.BARCODE_STOCK ? IMPORT_STRATEGIES.UPDATE_STOCK : IMPORT_STRATEGIES.CREATE_AND_IMPORT);
  const isReady = (row) => {
    if (row.masterType) return Boolean(row.creatable);
    return row.actions?.[chosen] === 'import' || row.actions?.[chosen] === 'update';
  };
  const filtered = filter === 'all'
    ? rows
    : rows.filter((row) => {
      if (filter === 'valid') {
        if (row.masterType) return !row.errors?.length && !row.duplicateOf;
        return !row.errors?.length && !row.duplicateOf;
      }
      if (filter === 'invalid') return Boolean(row.errors?.length);
      if (filter === 'missing_master') return Boolean(row.missing?.length);
      if (filter === 'ambiguous') return Boolean(row.missing?.some((missing) => missing.resolution === 'ambiguous'));
      if (filter === 'mapping_error') return Boolean(row.missing?.some((missing) => missing.resolution === 'mapping_error'));
      if (filter === 'existing_barcode') return Boolean(row.existingBarcode);
      if (filter === 'duplicate') return Boolean(row.duplicateOf);
      if (filter === 'ready') return isReady(row);
      return true;
    });
  const safePerPage = Math.min(Math.max(Number(perPage) || 20, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const start = (safePage - 1) * safePerPage;

  const counts = {
    all: rows.length,
    valid: rows.filter((row) => !row.errors?.length && !row.duplicateOf).length,
    invalid: rows.filter((row) => row.errors?.length).length,
    missing_master: rows.filter((row) => row.missing?.length).length,
    ambiguous: rows.filter((row) => row.missing?.some((missing) => missing.resolution === 'ambiguous')).length,
    mapping_error: rows.filter((row) => row.missing?.some((missing) => missing.resolution === 'mapping_error')).length,
    existing_barcode: rows.filter((row) => row.existingBarcode).length,
    duplicate: rows.filter((row) => row.duplicateOf).length,
    ready: rows.filter(isReady).length,
  };

  return {
    rows: filtered.slice(start, start + safePerPage),
    total: filtered.length,
    page: safePage,
    perPage: safePerPage,
    pages: Math.max(1, Math.ceil(filtered.length / safePerPage)),
    counts,
    sheet,
    filter,
  };
}

export const __private__ = {
  /* exported for the test suite; not part of the HTTP surface */
  buildIndexFromRaw,
  indexAfterMasters,
  rowLocation,
  rowItem,
  sortPlanEntries,
};
