import { isValidObjectId } from 'mongoose';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import Uom from '@/models/Uom';
import Supplier from '@/models/Supplier';
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

const exactName = (value) => new RegExp('^\\s*' + normName(value).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+') + '\\s*$', 'i');

/* Master resolution cache - one lookup per distinct value per import run */
function masterCache(businessId, session = null) {
  const memo = new Map();
  const once = (key, load) => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key);
  };
  const s = session || null;

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
    item: (name) => once('item:' + normName(name), () => Item.findOne({ businessId, $or: [{ name: exactName(name) }, { itemCode: exactName(name) }] })
      .select('name itemCode subGroupId hsnId uomId rsp wsp rspOfferPercent').session(s).lean().exec()),
    supplierByCode: (code) => once('supplierCode:' + code, () => Supplier.find({ businessId, contactId: code })
      .select('businessName billingState contactId').limit(2).session(s).lean().exec()),
    supplier: (name) => once('supplier:' + normName(name), () => Supplier.find({ businessId, businessName: exactName(name) })
      .select('businessName billingState contactId').limit(2).session(s).lean().exec()),
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
    matched += 1;
  } else {
    miss('Item', values.itemCode);
    links.problems.push({ field: 'itemCode', message: `Item "${values.itemCode}" not found in Item master` });
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
  if (values.hsn) {
    const hsnRows = (await cache.hsns()).filter((h) => String(h.code).trim() === values.hsn);
    if (hsnRows.length) {
      links.hsnId = hsnRows[0]._id;
      matched += 1;
      if (hsnRows.length > 1) {
        links.warnings.push({ field: 'hsn', message: `HSN ${values.hsn} exists ${hsnRows.length} times - using first` });
      }
      if (item && item.hsnId && !hsnRows.some((h) => String(h._id) === String(item.hsnId))) {
        links.warnings.push({ field: 'hsn', message: `Item has different HSN in master - keeping item's HSN` });
      }
    } else {
      miss('HSN', values.hsn);
      links.problems.push({ field: 'hsn', message: `HSN "${values.hsn}" not found in HSN master` });
    }
  }

  /* === Tax (GST) === */
  if (values.gst !== null && values.gst !== undefined && values.gst !== '') {
    const gstPct = Number(values.gst);
    const taxes = await cache.taxes();
    const hsnTaxSlabs = links.hsnId ? (await cache.hsns()).find((h) => String(h._id) === String(links.hsnId))?.taxSlabs || [] : [];
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
  }

  /* === Supplier === */
  if (values.supplierName || values.supplierCode) {
    const supplierCode = values.supplierCode || '';
    const supplierName = values.supplierName || '';
    
    // Try by code first, then by name
    const byCode = supplierCode ? await cache.supplierByCode(supplierCode) : [];
    const found = byCode.length ? byCode : await cache.supplier(supplierName);
    
    if (found.length) {
      links.supplierId = found[0]._id;
      matched += 1;
      if (found.length > 1) {
        links.warnings.push({ field: 'supplier', message: `Supplier "${supplierName}" exists ${found.length} times - using first` });
      }
    } else {
      miss('Supplier', supplierName || supplierCode);
      links.warnings.push({ field: 'supplier', message: `Supplier "${supplierName || supplierCode}" not found` });
    }
  }

  /* === UOM === */
  if (values.uom) {
    const uoms = await once('uoms', () => Uom.find({ businessId }).select('name shortName').session(s).lean().exec());
    
    const uom = uoms.find((u) => 
      normName(u.shortName || u.name) === normName(values.uom) ||
      (u.shortName || u.name) === values.uom
    );
    
    if (uom) {
      links.uomId = uom._id;
      matched += 1;
    } else {
      miss('UOM', values.uom);
      links.problems.push({ field: 'uom', message: `UOM "${values.uom}" not found in UOM master` });
    }
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
