/* Item Master lookup + validation shared by the GRC Barcode Generation sheet
   and its save route.

   The grid asks the item master for suggestions and warns the operator while
   typing; the save route runs the SAME rules again before anything is written,
   so a request that never came through the screen cannot store an item code
   that does not exist. Pure functions and no mongoose here, so importing this
   from a client component is safe.

   BARCODE FIELDS ARE DELIBERATELY ABSENT from ITEM_LOOKUP_FIELDS. Barcode No
   and Generated Barcode are issued by the save route (lib/barcodeValue.js) and
   must keep behaving exactly as they did. */

import { gstPercentForAmount } from '@/lib/hsnGst';

/* The editable cells that may resolve an item from the master. Item Code is
   the primary one; Retail Price / Disc 1 / the selling prices are included
   because the operator may start from any of them, and the same picker fills
   the whole row. */
export const ITEM_LOOKUP_FIELDS = new Set([
  'itemCode', 'itemName', 'retailPrice', 'disc1', 'rsp', 'wsp', 'dp',
  'supplierDescription', 'printDescription',
]);

export const isItemLookupField = (key) => ITEM_LOOKUP_FIELDS.has(key);

/* Barcode cells, named separately so a future edit cannot accidentally make
   them eligible: the sheet never asks the item master about these. */
export const BARCODE_FIELDS = new Set(['barcodeNo', 'barcodeGenerated', 'barcodeIdentifier']);

export const normaliseItemCode = (value) => String(value ?? '').trim().toLowerCase();

const text = (value) => String(value ?? '').trim();
const num = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const fixed2 = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '');

/* A row from /api/item or /api/item/validate, reduced to what the sheet and
   the save need. `code` is the value the operator types: itemCode when the
   master has one, otherwise the item name (most legacy items keep their code
   in `name` - see app/api/item/[id]/detail/route.js). */
export function masterItemOf(doc) {
  if (!doc) return null;
  const code = text(doc.itemCode) || text(doc.name) || text(doc.code);
  if (!code) return null;
  return {
    id: String(doc._id || doc.id || ''),
    itemCode: text(doc.itemCode),
    name: text(doc.name),
    description: text(doc.description),
    code,
    retailPrice: num(doc.rsp ?? doc.retailPrice),
    wsp: num(doc.wsp),
    dp: num(doc.dp),
    rspOfferPct: num(doc.rspOfferPercent ?? doc.rspOfferPct),
    wspOfferPct: num(doc.wspOfferPct),
    dpOfferPct: num(doc.dpOfferPct),
    markupRSP: num(doc.markupRSP ?? doc.markupRsp),
    markupWSP: num(doc.markupWSP ?? doc.markupWsp),
    markupDP: num(doc.markupDP ?? doc.markupDp ?? doc.markupEcomm ?? doc.markupEComm),
    hsnId: text(doc.hsnId),
    hsnCode: text(doc.hsnCode),
    slabs: Array.isArray(doc.slabs) ? doc.slabs : [],
  };
}

/* Every master item by normalised code and, separately, by normalised name -
   an old row may carry either. */
export function masterIndex(items = []) {
  const byCode = new Map();
  (items || []).forEach((raw) => {
    const item = masterItemOf(raw);
    if (!item) return;
    if (item.itemCode) byCode.set(normaliseItemCode(item.itemCode), item);
    if (item.name) byCode.set(normaliseItemCode(item.name), item);
  });
  return byCode;
}

export function exactMaster(items, code) {
  const key = normaliseItemCode(code);
  if (!key) return null;
  return masterIndex(items).get(key) || null;
}

/* What picking an item writes onto the row.

   Mirrors the Add Item form's selection (handleItemSelection /
   withItemOffers / withFormPrices in GCRBarcodeGeneration): the item's code,
   name, description, HSN and its own markups / offer %s, and the prices those
   produce. A price the item master does not carry is left exactly as it was -
   nothing is blanked. Disc 1 has no master field and is never touched.
   Barcode No / Generated Barcode are not in the patch. */
export function itemSelectionPatch(row, item) {
  const master = masterItemOf(item);
  if (!master) return {};
  const patch = {
    itemCode: master.itemCode || master.name,
    itemName: master.name || master.itemCode,
  };
  if (master.id) patch.itemId = master.id;
  /* descriptions fill only an empty cell - an operator's wording is not
     thrown away by re-picking the same item */
  if (master.description) {
    if (!text(row?.printDescription)) patch.printDescription = master.description;
    if (!text(row?.supplierDescription)) patch.supplierDescription = master.description;
  }
  if (master.hsnCode) {
    patch.hsn = master.hsnCode;
    if (master.hsnId) patch.hsnId = master.hsnId;
  }

  const finalPrice = Number(row?.finalPrice || 0);
  const setPrice = (base, value, markupKey) => {
    if (value === null) return;
    const price = fixed2(value);
    patch[base] = price;
    if (base === 'rsp') patch.retailPrice = price;
    if (markupKey && finalPrice > 0) patch[markupKey] = fixed2((Number(price) / finalPrice - 1) * 100);
  };
  setPrice('rsp', master.retailPrice, 'markupRSP');
  setPrice('wsp', master.wsp, 'markupWSP');
  setPrice('dp', master.dp, 'markupDP');

  /* the item's own markup wins when it has one, exactly as the Add Item form
     does - and the price follows it */
  [['markupRSP', 'rsp'], ['markupWSP', 'wsp'], ['markupDP', 'dp']].forEach(([markupKey, base]) => {
    const markup = master[markupKey];
    if (markup === null) return;
    patch[markupKey] = fixed2(markup);
    if (finalPrice > 0) {
      const price = fixed2(finalPrice * (1 + markup / 100));
      patch[base] = price;
      if (base === 'rsp') patch.retailPrice = price;
    }
  });

  /* offers are percentages in the Item master; the sheet stores the resulting
     offer price beside the % */
  const offerFor = (base, pct, offerKey, pctKey) => {
    if (pct === null || pct <= 0 || pct >= 100) return;
    const basePrice = Number(patch[base] ?? row?.[base] ?? (base === 'rsp' ? row?.retailPrice : 0));
    patch[pctKey] = fixed2(pct);
    if (basePrice > 0) patch[offerKey] = fixed2(basePrice * (1 - pct / 100));
  };
  offerFor('rsp', master.rspOfferPct, 'offerPrice', 'rspOfferPct');
  offerFor('wsp', master.wspOfferPct, 'wspPrice', 'wspOfferPct');
  offerFor('dp', master.dpOfferPct, 'dpPrice', 'dpOfferPct');

  /* GST% from the item's HSN slab, by the row's value - the same lookup the
     Add Item form and /api/item/<id>/detail perform */
  if (master.slabs.length) {
    const amount = finalPrice || Number(patch.retailPrice ?? row?.retailPrice) || Number(row?.purchaseRate) || 0;
    const pct = gstPercentForAmount(master.slabs, amount);
    if (pct > 0) patch.gst = String(pct);
  }
  return patch;
}

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
};

/* Every problem / warning for one row, as { errors: {field}, warnings:
   {field}, master }.

   errors BLOCK the save: an item code the master does not know, a blank item,
   a non-numeric or out-of-range price / discount. warnings let the save go
   through but ask the operator to check: most importantly a Retail Price that
   differs from the item's master price. The sheet never overwrites a price
   the operator typed; it shows the two side by side instead.

   `master` null means "not found" only when `checkMaster` is true - a saved
   legacy row left untouched is not judged by this screen unless the operator
   changed it (see needsCheck in lib/itemsSheet.js). */
export function rowItemIssues(row, master, { checkMaster = true, businessHasItems = true } = {}) {
  const errors = {};
  const warnings = {};
  const code = text(row?.itemCode);

  if (!code) {
    errors.itemCode = 'Item Code is required - select a valid item from the Item Master.';
  } else if (checkMaster && businessHasItems && !master) {
    errors.itemCode = 'Invalid Item Code! This item code does not exist in the Item Master. Please select a valid item code.';
  }

  const retail = text(row?.retailPrice || row?.rsp);
  if (retail !== '') {
    if (!Number.isFinite(Number(retail))) {
      errors.retailPrice = 'Invalid Retail Price - enter a number.';
      errors.rsp = errors.retailPrice;
    } else if (master && master.retailPrice !== null && Math.abs(Number(retail) - master.retailPrice) > 0.005) {
      warnings.retailPrice = `Retail Price Mismatch! Master Price: ₹${money(master.retailPrice)} · Entered Price: ₹${money(retail)}. Please verify the retail price before proceeding.`;
      warnings.rsp = warnings.retailPrice;
    }
  }

  const disc1 = text(row?.disc1);
  if (disc1 !== '') {
    if (!Number.isFinite(Number(disc1))) errors.disc1 = 'Invalid Discount - Disc 1 must be a number.';
    else if (Number(disc1) < 0 || Number(disc1) > 100) errors.disc1 = 'Invalid Discount - Disc 1 must be between 0 and 100.';
  }

  const discount = text(row?.discount);
  if (discount !== '') {
    if (!Number.isFinite(Number(discount))) errors.discount = 'Invalid Discount - enter a number.';
    else if (Number(discount) < 0) errors.discount = 'Invalid Discount - it cannot be negative.';
    else if (row?.discountType !== 'Flat' && Number(discount) > 100) {
      errors.discount = 'Invalid Discount - a percentage discount cannot exceed 100.';
    }
  }

  ['purchaseRate', 'finalPrice', 'rsp', 'wsp', 'dp', 'offerPrice', 'wspPrice', 'dpPrice', 'gst']
    .forEach((key) => {
      const value = text(row?.[key]);
      if (value !== '' && !Number.isFinite(Number(value))) {
        errors[key] = `${key === 'purchaseRate' ? 'Purchase Rate' : key} must be a number.`;
      }
    });

  return { errors, warnings, master: master || null };
}

/* A short, explicit summary for the Submit banner and the server response. */
export function itemValidationSummary(rows, issuesByIndex) {
  const summary = {
    rowsChecked: 0,
    validRows: 0,
    invalidItemCodes: 0,
    retailPriceMismatches: 0,
    invalidDiscounts: 0,
    missingInformation: 0,
    errors: [],
    warnings: [],
  };
  (rows || []).forEach((row, index) => {
    const issues = issuesByIndex.get(index);
    if (!issues) return;
    summary.rowsChecked += 1;
    const errorKeys = Object.keys(issues.errors || {});
    const warningKeys = Object.keys(issues.warnings || {});
    if (!errorKeys.length) summary.validRows += 1;
    if (issues.errors?.itemCode) {
      if (!String(row?.itemCode ?? '').trim()) summary.missingInformation += 1;
      else summary.invalidItemCodes += 1;
    }
    if (issues.warnings?.retailPrice) summary.retailPriceMismatches += 1;
    if (issues.errors?.disc1 || issues.errors?.discount) summary.invalidDiscounts += 1;
    errorKeys.forEach((field) => summary.errors.push({
      rowIndex: index, rowId: row?.id ?? null, field, message: issues.errors[field],
    }));
    warningKeys.forEach((field) => summary.warnings.push({
      rowIndex: index, rowId: row?.id ?? null, field, message: issues.warnings[field],
    }));
    ['qty', 'purchaseRate', 'billSlNo', 'p_m_f'].forEach((field) => {
      if (issues.errors?.[field]) summary.missingInformation += 1;
    });
  });
  return summary;
}

/* The one sentence a refusal shows first. */
export function itemValidationMessage(summary) {
  const parts = [];
  if (summary.invalidItemCodes) parts.push(`${summary.invalidItemCodes} invalid item code${summary.invalidItemCodes === 1 ? '' : 's'}`);
  if (summary.retailPriceMismatches) parts.push(`${summary.retailPriceMismatches} retail price mismatch${summary.retailPriceMismatches === 1 ? '' : 'es'}`);
  if (summary.invalidDiscounts) parts.push(`${summary.invalidDiscounts} invalid discount${summary.invalidDiscounts === 1 ? '' : 's'}`);
  if (summary.missingInformation) parts.push(`${summary.missingInformation} missing required value${summary.missingInformation === 1 ? '' : 's'}`);
  const detail = summary.errors[0] ? ` ${summary.errors[0].message}` : '';
  return `The item details could not be saved${parts.length ? ` - ${parts.join(', ')}` : ''}.${detail}`;
}
