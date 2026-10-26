import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import Uom from '@/models/Uom';
import { Supplier } from '@/lib/contacts';
import CompanyLocation from '@/models/CompanyLocation';
import StockPoint from '@/models/StockPoint';
import Business from '@/models/Business';

/* ==========================================================================
   HSR MASTER DATA RESOLUTION

   This module resolves master data references from HSR Excel import values
   to actual database IDs. It follows the same pattern as barcodeReportImportService.js
   but is extended for HSR-specific requirements.

   Masters are NEVER created automatically - they must exist or be marked as missing.
   ========================================================================== */

export const normName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/* UOM spellings are free text in the master ("Pc(s)", "MTR", "Metre",
   "Pieces"), so they are compared on the letters and digits only, with the
   common singular/plural and unit aliases folded together. */
const UOM_ALIASES = {
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', nos: 'pc', no: 'pc', unit: 'pc', units: 'pc',
  mtr: 'mtr', mtrs: 'mtr', meter: 'mtr', meters: 'mtr', metre: 'mtr', metres: 'mtr',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
};
export const uomKey = (value) => {
  const flat = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return UOM_ALIASES[flat] || flat.replace(/s$/, '');
};

const isUnassigned = (value) => {
  const text = String(value ?? '').trim();
  return !text || text === '0' || /^\(?unassigned\)?$/i.test(text);
};

/* Master resolution cache - ONE read per master collection per import run.

   The opening workbook has 20,000+ rows and thousands of distinct item
   codes. Looking each value up with its own query made the analysis take
   minutes and time the HTTP request out, so every collection this module
   needs is read once and indexed in memory. */
function masterCache(businessId, session = null) {
  const memo = new Map();
  const once = (key, load) => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key);
  };
  const s = session || null;
  const unwrap = (value) => Promise.resolve(value).then((rows) => rows || []);
  const addTo = (map, key, row) => {
    const normalized = normName(key);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, []);
    map.get(normalized).push(row);
  };

  const items = () => once('items', () => Item.find({ businessId })
    .select('name itemCode subGroupId hsnId uomId gstId uniqueBarcode rsp wsp rspOfferPercent')
    .session(s).lean().exec());
  const itemMaps = () => once('itemMaps', () => unwrap(items()).then((rows) => {
    const byCode = new Map();
    const byName = new Map();
    rows.forEach((row) => {
      addTo(byCode, row.itemCode, row);
      addTo(byName, row.name, row);
    });
    return { byCode, byName };
  }));

  const suppliers = () => once('suppliers', () => Supplier.find({ businessId, contactKind: 'Supplier' })
    .select('businessName billingState contactId')
    .session(s).lean().exec());
  const supplierMaps = () => once('supplierMaps', () => unwrap(suppliers()).then((rows) => {
    const byCode = new Map();
    const byName = new Map();
    rows.forEach((row) => {
      addTo(byCode, row.contactId, row);
      addTo(byName, row.businessName, row);
    });
    return { byCode, byName };
  }));

  return {
    groups: () => once('groups', () => ProductGroup.find({ businessId }).select('name parentId').session(s).lean().exec()),
    hsns: () => once('hsns', () => Hsn.find({ businessId }).select('code taxSlabs').session(s).lean().exec()),
    taxes: () => once('taxes', () => Tax.find({ businessId }).select('taxName igst').session(s).lean().exec()),
    locations: () => once('locations', async () => {
      const live = new Set((await Business.find({}).select('_id').session(s).lean()).map((b) => String(b._id)));
      return (await CompanyLocation.find({}).select('name businessId').session(s).lean()).filter((l) => live.has(String(l.businessId)));
    }),
    stockPoints: () => once('stockPoints', () => StockPoint.find({}).select('stockPoint locationId businessId').session(s).lean().exec()),
    uoms: () => once('uoms', () => Uom.find({ businessId }).select('name shortName').session(s).lean().exec()),
    item: async (value) => {
      const normalized = normName(value);
      if (!normalized) return null;
      const maps = await itemMaps();
      const matches = maps.byCode.get(normalized) || maps.byName.get(normalized) || [];
      return matches[0] || null;
    },
    supplierByCode: async (code) => {
      const maps = await supplierMaps();
      return maps.byCode.get(normName(code)) || [];
    },
    supplier: async (name) => {
      const maps = await supplierMaps();
      return maps.byName.get(normName(name)) || [];
    },
    uom: (id) => once('uom:' + id, () => (id ? Uom.findById(id).select('name shortName').session(s).lean().exec() : Promise.resolve(null))),
  };
}

/* Resolve masters for a single HSR record */
export async function resolveHSRMasters(record, cache, businessId) {
  const values = record.values;
  const links = { problems: [], warnings: [] };
  const unmatched = [];
  const warnings = [];
  let matched = 0;

  const miss = (type, name) => {
    if (name && !unmatched.some((u) => u.type === type && normName(u.name) === normName(name))) {
      unmatched.push({ type, name });
    }
  };

  /* === Item === */
  const item = values.itemCode ? await cache.item(values.itemCode) : null;
  if (item) {
    links.itemId = item._id;
    links.itemName = item.name;
    links.itemUniqueBarcode = item.uniqueBarcode || '';
    links.itemUomId = item.uomId || null;
    links.itemHsnId = item.hsnId || null;
    links.itemGstId = item.gstId || null;
    if (!values.itemName) values.itemName = item.name || '';
    matched += 1;
  } else {
    /* An HSR opening workbook often carries item codes that were never
       created in the Item master (the warehouse seed imported them with
       itemId=null). A barcode row stores its own item code/name, so this is
       a warning, not a blocker: refusing the whole workbook because the
       Item master is incomplete is what made the old import unusable. */
    miss('Item', values.itemCode);
    links.warnings.push({
      field: 'itemCode',
      message: `Item "${values.itemCode}" is not in the Item master - the barcode will keep the workbook item code and item name (itemId empty).`,
    });
  }

  /* === Product Group (Parent) === */
  if (values.groupName) {
    const groups = await cache.groups();
    const group = groups.find((g) => !g.parentId && normName(g.name) === normName(values.groupName));
    if (group) {
      links.groupId = group._id;
      matched += 1;
    } else {
      miss('Group', values.groupName);
      links.warnings.push({ field: 'groupName', message: `Group "${values.groupName}" not found` });
    }
  }

  /* === Product Sub Group === */
  if (values.subGroupName) {
    const groups = await cache.groups();
    const sub = groups.find((g) => {
      const parentMatch = links.groupId ? String(g.parentId) === String(links.groupId) : true;
      return g.parentId && normName(g.name) === normName(values.subGroupName) && parentMatch;
    });
    if (sub) {
      links.subGroupId = sub._id;
      matched += 1;
    } else {
      miss('Sub Group', values.subGroupName);
      links.warnings.push({ field: 'subGroupName', message: `Sub Group "${values.subGroupName}" not found` });
    }
  }

  /* === HSN === */
  const hsns = await cache.hsns();
  const workbookHsn = String(values.hsn || '').trim();
  const hsnRows = workbookHsn ? hsns.filter((h) => String(h.code).trim() === workbookHsn) : [];
  if (hsnRows.length) {
    links.hsnId = hsnRows[0]._id;
    matched += 1;
    if (hsnRows.length > 1) {
      links.warnings.push({ field: 'hsn', message: `HSN ${workbookHsn} exists ${hsnRows.length} times - using first` });
    }
    if (item && item.hsnId) {
      const itemHsn = hsns.find((h) => String(h._id) === String(item.hsnId));
      if (itemHsn && String(itemHsn.code).trim() !== workbookHsn) {
        links.hsnId = itemHsn._id;
        links.warnings.push({ field: 'hsn', message: `Item master HSN ${itemHsn.code} differs from workbook ${workbookHsn} - keeping item's HSN` });
      }
    }
  } else if (item && item.hsnId) {
    const itemHsn = hsns.find((h) => String(h._id) === String(item.hsnId));
    if (itemHsn) {
      links.hsnId = itemHsn._id;
      if (!values.hsn) values.hsn = String(itemHsn.code || '');
      matched += 1;
    }
  } else if (workbookHsn) {
    /* Same rule as a missing Item master: an opening stock workbook may use
       HSN codes that were never created as masters. The barcode row carries
       the workbook HSN, so this must not block the whole row. */
    miss('HSN', workbookHsn);
    links.warnings.push({ field: 'hsn', message: `HSN "${workbookHsn}" not found in HSN master - barcode keeps the workbook HSN.` });
  }

  /* === Tax (GST) === */
  if (values.gst !== null && values.gst !== undefined && values.gst !== '') {
    const gstPct = Number(values.gst);
    const taxes = await cache.taxes();
    const hsnTaxSlabs = links.hsnId ? hsns.find((h) => String(h._id) === String(links.hsnId))?.taxSlabs || [] : [];
    const slabIds = new Set(hsnTaxSlabs.map((t) => String(t.gstTaxNameId)));
    const at = taxes.filter((t) => Number(t.igst) === gstPct);
    
    // Prefer HSN's tax slab, then plain "GST n%", then any match
    const tax = at.find((t) => slabIds.has(String(t._id)))
      || at.find((t) => normName(t.taxName).replace(/[\s%]/g, '') === 'gst' + gstPct)
      || at[0];
    
    if (tax) {
      links.taxId = tax._id;
      matched += 1;
    } else {
      miss('Tax', `GST ${gstPct}%`);
      links.warnings.push({ field: 'gst', message: `Tax slab for GST ${gstPct}% not found` });
    }
  } else if (item && item.gstId) {
    links.taxId = item.gstId;
    matched += 1;
  }

  /* === Supplier === */
  const supplierCode = isUnassigned(values.supplierCode) ? '' : values.supplierCode;
  const supplierName = isUnassigned(values.supplierName) ? '' : values.supplierName;
  if (supplierName || supplierCode) {
    // Try by code first, then by name
    const byCode = supplierCode ? await cache.supplierByCode(supplierCode) : [];
    const found = byCode.length ? byCode : await cache.supplier(supplierName);
    
    if (found.length) {
      links.supplierId = found[0]._id;
      links.supplierName = found[0].businessName || '';
      matched += 1;
      if (found.length > 1) {
        links.warnings.push({ field: 'supplier', message: `Supplier "${supplierName || supplierCode}" exists ${found.length} times - using first` });
      }
    } else {
      miss('Supplier', supplierName || supplierCode);
      links.warnings.push({ field: 'supplier', message: `Supplier "${supplierName || supplierCode}" not found` });
    }
  }

  /* === UOM === */
  const uomRows = await cache.uoms();
  let uom = null;
  if (values.uom) {
    const wanted = uomKey(values.uom);
    uom = uomRows.find((u) => uomKey(u.shortName || u.name) === wanted || uomKey(u.name) === wanted) || null;
  } else if (links.itemUomId) {
    uom = await cache.uom(links.itemUomId);
  }
  if (uom) {
    links.uomId = uom._id;
    links.uomName = uom.shortName || uom.name || values.uom || '';
    if (!values.uom) values.uom = links.uomName;
    matched += 1;
  } else if (values.uom) {
    /* The barcode keeps the workbook UOM text when no UOM master matches. */
    miss('UOM', values.uom);
    links.warnings.push({ field: 'uom', message: `UOM "${values.uom}" not found in UOM master - barcode keeps the workbook UOM.` });
  }

  /* === Location (Target Warehouse) === */
  // This will be provided by the import scope, not from Excel
  // But we can validate if a location name is provided in the Excel
  if (values.locationName) {
    const locations = await cache.locations();
    const loc = locations.find((l) => normName(l.name) === normName(values.locationName));
    if (loc) {
      if (String(loc.businessId) !== String(businessId)) {
        links.warnings.push({ field: 'location', message: `Location "${values.locationName}" belongs to another business` });
      } else {
        links.locationId = loc._id;
        matched += 1;
      }
    } else {
      miss('Location', values.locationName);
      links.warnings.push({ field: 'location', message: `Location "${values.locationName}" not found` });
    }
  }

  return {
    links,
    unmatched,
    warnings,
    matched,
  };
}

/* Batch resolve masters for multiple records */
export async function resolveBatchHSRMasters(records, businessId, session = null) {
  const cache = masterCache(businessId, session);
  const results = [];
  let totalMatched = 0;
  const allUnmatched = [];
  const allWarnings = [];

  for (const record of records) {
    const resolved = await resolveHSRMasters(record, cache, businessId);
    totalMatched += resolved.matched;
    
    // Collect unmatched masters
    resolved.unmatched.forEach((u) => {
      if (!allUnmatched.some((a) => a.type === u.type && normName(a.name) === normName(u.name))) {
        allUnmatched.push({ ...u, rows: [record.line] });
      } else {
        const existing = allUnmatched.find((a) => a.type === u.type && normName(a.name) === normName(u.name));
        if (existing && !existing.rows.includes(record.line)) {
          existing.rows.push(record.line);
        }
      }
    });

    // Collect warnings
    resolved.warnings.forEach((w) => {
      allWarnings.push({ ...w, line: record.line });
    });

    results.push({
      ...record,
      links: resolved.links,
      hasProblems: record.hasProblems || resolved.links.problems.length > 0,
      problems: [...record.problems, ...resolved.links.problems],
      warnings: resolved.warnings,
    });
  }

  return {
    records: results,
    mastersMatched: totalMatched,
    unmatched: allUnmatched,
    warnings: allWarnings,
  };
}

/* Count unmatched masters by type */
export function summarizeUnmatchedMasters(unmatched) {
  const summary = {};
  unmatched.forEach((u) => {
    if (!summary[u.type]) {
      summary[u.type] = { count: 0, names: new Set() };
    }
    summary[u.type].count += 1;
    summary[u.type].names.add(u.name);
  });

  return Object.entries(summary).map(([type, data]) => ({
    type,
    count: data.count,
    examples: Array.from(data.names).slice(0, 5),
  }));
}

export default {
  resolveHSRMasters,
  resolveBatchHSRMasters,
  summarizeUnmatchedMasters,
  masterCache,
};
