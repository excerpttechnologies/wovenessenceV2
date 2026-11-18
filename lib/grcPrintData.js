/* The GRC print document's DATA - one loader for every print surface.

   The branch printed on a challan is the branch the GRC was SAVED with:

       grc.businessId  -> the company / branch that received the goods
       grc.locationId  -> the location / warehouse inside that branch

   It is never the business/location currently selected in the header, and
   never the logged-in user's branch. Both of those are application state;
   a historical document must keep its own.

   A GRC created before locationId was saved carries stockPointId, and every
   barcode row carries the location it was received at - both are used, in
   that order, before falling back to the business letterhead. */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import StockPoint from '@/models/StockPoint';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Delivery from '@/models/Delivery';
import { Supplier } from '@/lib/contacts';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { encodedBarcodeValue } from '@/lib/barcodeValue';
import { rowQty, rowRate } from '@/lib/grcMoney';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* First value that is a real, non-zero number. A stored '' means "not set";
   a stored '0' is treated as "not set" only while a later column has a real
   figure - the alternative would print a zero Final Price for a row whose
   purchase rate is stored and whose final-net was never filled. */
const firstNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const uuidOf = (value) => String(value ?? '');

/* '254' is a legacy numeric unit id, not a unit. Read the unit TYPE the row
   also stores (PC / MTR) instead of printing the id. */
const printableUom = (row) => {
  const raw = clean(row?.uom);
  const type = clean(row?.uomType).toUpperCase();
  if (raw && !/^\d+$/.test(raw)) return raw;
  if (type === 'MTR') return 'Mtr';
  if (type === 'PC') return 'Pc(s)';
  return type || raw || '';
};

const gpPercent = (stored, price, rsp) => {
  const given = Number(stored);
  if (Number.isFinite(given) && given !== 0) return given;
  if (price > 0 && rsp > 0) return ((rsp - price) / price) * 100;
  return null;
};

const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

/* ---------------------------------------------------------------- naming -- */

const normalizeName = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return grid[a.length][b.length];
}

/* Master data spells the same branch two ways ("TEMPLE FABRIC JNR" on the
   location, "Temple Fabrics-JNR" on the business). Treat them as the same
   name; anything genuinely different (Warehouse, C2, HSR) stays different. */
function sameName(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  /* One typo tolerance is enough for "TEMPLE FABRIC JNR" vs
     "Temple Fabrics-JNR"; more than that would make C2 look like JNR. */
  const tolerance = Math.max(x.length, y.length) >= 30 ? 2 : 1;
  return editDistance(x, y) <= tolerance;
}

function titleCaseBranch(raw) {
  let text = clean(raw);
  if (!text) return '';
  if (text === text.toUpperCase()) {
    text = text.replace(/[A-Za-z][A-Za-z'&.]*/g, (word) => {
      if (word.length <= 3 && (/^[A-Z]+$/.test(word) || /\d/.test(word))) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }
  /* "Temple Fabrics Warehouse" reads as the branch it is. This only joins a
     qualifier that is already in the master's own name - it never invents
     one, and it never touches a name that already carries the hyphen. */
  text = text.replace(
    /\s+(Warehouse|Showroom|Branch|JNR|RRN|HSR|C\d{1,2})$/i,
    '-$1'
  );
  return text;
}

export function resolveBranchName(business, location) {
  const businessLegal = clean(business?.name);
  const businessPrint = clean(business?.businessPrintName);
  const businessName = businessPrint || businessLegal;

  if (!location) return titleCaseBranch(businessName);

  const locPrint = clean(location.businessPrintName);
  const locName = clean(location.name);

  /* A location's print name that merely repeats the company name is not a
     branch label. Where the location has a real name of its own, use it. */
  let candidate = locPrint && !sameName(locPrint, businessLegal) && !sameName(locPrint, businessName)
    ? locPrint
    : (locName || locPrint);

  /* …and where that name is the company name itself, the business's print
     name is the more useful label (HSR / Suvarna). */
  if (!candidate || sameName(candidate, businessName) || sameName(candidate, businessLegal)) {
    candidate = businessName || candidate || locName;
  }
  return titleCaseBranch(candidate);
}

/* ------------------------------------------------------------------ items -- */

function barcodeRowToItem(row, index) {
  const qty = rowQty(row);
  const price = firstNumber(row?.finalNet, row?.finalPrice, row?.purRate, row?.purchaseRate);
  const amount = firstNumber(row?.netAmount, row?.amount, row?.beforeTax, qty * price);
  const rsp = firstNumber(row?.retailPrice, row?.rsp, row?.RSP);
  const batchNo = clean(row?.barcodeNo)
    || clean(row?.batchNo)
    || clean(row?.batchUnique)
    || clean(encodedBarcodeValue(row));

  return {
    sn: index + 1,
    itemName: clean(row?.itemName)
      || clean(row?.printDescription)
      || clean(row?.supplierDescription)
      || clean(row?.itemCode),
    batchNo,
    qty,
    uom: printableUom(row),
    price,
    amount,
    rsp,
    gp: gpPercent(row?.gp, price, rsp),
  };
}

function storedItemToItem(row, index) {
  const qty = firstNumber(row?.qty, row?.quantity, row?.Qty);
  const price = firstNumber(
    row?.finalPrice, row?.finalNet, row?.finalRate, row?.purchaseRate, row?.purRate
  );
  const amount = firstNumber(row?.amount, row?.beforeTax, row?.netAmount, qty * price);
  const rsp = firstNumber(row?.rsp, row?.retailPrice, row?.RSP);

  return {
    sn: index + 1,
    itemName: clean(row?.itemName)
      || clean(row?.printDescription)
      || clean(row?.supplierDescription)
      || clean(row?.itemCode),
    batchNo: clean(row?.barcodeNo) || clean(row?.batchNo) || clean(row?.batchUnique),
    qty,
    uom: printableUom(row),
    price,
    amount,
    rsp,
    gp: gpPercent(row?.gp, price, rsp),
  };
}

/* One row per barcode. A repeated barcode NUMBER is the same unit arriving
   twice in the view, so it is folded rather than printed twice. Distinct
   barcodes of the same item stay distinct - they are different pieces. */
function itemsFromBarcodeRows(rows) {
  const seen = new Map();
  const items = [];
  (rows || []).forEach((row) => {
    const item = barcodeRowToItem(row, items.length);
    const key = clean(row?.barcodeNo) || uuidOf(row?._id);
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.qty = round2(existing.qty + item.qty);
      existing.amount = round2(existing.amount + item.amount);
      return;
    }
    seen.set(key, item);
    items.push(item);
  });
  return items.map((item, index) => ({ ...item, sn: index + 1 }));
}

/* Lines saved on the GRC (or, only where the GRC carries no line detail at
   all, the lines of the purchase invoice generated from it) have no barcode
   numbers of their own. Identical repeated lines are one line. */
function itemsFromStoredLines(lines) {
  const merged = new Map();
  (lines || []).forEach((row) => {
    const item = storedItemToItem(row, 0);
    const key = [
      clean(row?.billSlNo), item.itemName, item.batchNo, item.qty === 0 ? '' : item.price,
      item.rsp, item.uom,
    ].join('|');
    const existing = merged.get(key);
    if (existing) {
      existing.qty = round2(existing.qty + item.qty);
      existing.amount = round2(existing.amount + item.amount);
      return;
    }
    merged.set(key, item);
  });
  return [...merged.values()].map((item, index) => ({ ...item, sn: index + 1 }));
}

/* ---------------------------------------------------------------- payload -- */

export async function loadGrcPrintPayload(id) {
  await dbConnect();
  if (!mongoose.isValidObjectId(id)) return null;

  const grc = await Grc.findById(id).lean();
  if (!grc) return null;

  const [initialBusiness, initialLocation, stockPoint, supplier, deliveryById, barcodeRows, invoice] = await Promise.all([
    grc.businessId ? Business.findById(grc.businessId).lean() : null,
    grc.locationId ? CompanyLocation.findById(grc.locationId).lean() : null,
    grc.stockPointId ? StockPoint.findById(grc.stockPointId).lean() : null,
    grc.supplierId ? Supplier.findById(grc.supplierId).lean() : null,
    grc.lrTransactionId ? Delivery.findById(grc.lrTransactionId).lean() : null,
    BarcodeLabel.find({ grcId: String(grc._id) }).sort({ createdAt: 1, _id: 1 }).lean(),
    grc.purchaseInvoiceId ? PurchaseInvoice.findById(grc.purchaseInvoiceId).select('items').lean() : null,
  ]);

  /* ---- branch/location resolution -------------------------------------
     1. the location saved on the GRC
     2. the GRC's stock point's location (older records)
     3. the location its barcode rows were received at
     4. only ONE location under the business - unambiguous, so safe
     5. the business letterhead (no location is ever invented) */
  let location = initialLocation;
  if (!location && stockPoint?.locationId) {
    location = await CompanyLocation.findById(stockPoint.locationId).lean();
  }
  if (!location) {
    const rowLocationId = (barcodeRows || [])
      .map((row) => clean(row?.locationId))
      .find((value) => mongoose.isValidObjectId(value));
    if (rowLocationId) location = await CompanyLocation.findById(rowLocationId).lean();
  }

  let business = initialBusiness;
  if (!business && location?.businessId) {
    business = await Business.findById(location.businessId).lean();
  }
  if (!business) {
    const rowBusinessId = (barcodeRows || [])
      .map((row) => clean(row?.businessId))
      .find((value) => mongoose.isValidObjectId(value));
    if (rowBusinessId) business = await Business.findById(rowBusinessId).lean();
  }
  if (!location && business?._id) {
    const locations = await CompanyLocation.find({ businessId: business._id }).select('_id').limit(2).lean();
    if (locations.length === 1) location = await CompanyLocation.findById(locations[0]._id).lean();
  }

  /* LR / delivery: the GRC stores both the reference and the transaction
     number; the LR master has the actual LR number and booking date. */
  let delivery = deliveryById;
  if (!delivery && grc.lrTransactionNo) {
    delivery = await Delivery.findOne({
      transactionNo: grc.lrTransactionNo,
      ...(grc.businessId ? { businessId: grc.businessId } : {}),
    }).lean();
  }

  /* ---- items ----------------------------------------------------------
     Barcode rows are the real received units. A challan whose barcode rows
     were never generated (the header-only GRCs) keeps its own saved lines;
     a GRC converted to a purchase invoice before item detail was stored can
     still show the lines of that invoice - the goods are the same receipt,
     and its own header totals remain the ones printed. */
  let items = [];
  let itemSource = 'none';
  if (barcodeRows?.length) {
    items = itemsFromBarcodeRows(barcodeRows);
    itemSource = 'barcode';
  }
  if (!items.length && Array.isArray(grc.items) && grc.items.length) {
    items = itemsFromStoredLines(grc.items);
    itemSource = 'grc';
  }
  if (!items.length && Array.isArray(invoice?.items) && invoice.items.length) {
    items = itemsFromStoredLines(invoice.items);
    itemSource = 'purchase-invoice';
  }

  const summedQty = round2(items.reduce((sum, item) => sum + num(item.qty), 0));
  const summedAmount = round2(items.reduce((sum, item) => sum + num(item.amount), 0));

  const branch = {
    name: resolveBranchName(business, location),
    businessName: clean(business?.businessPrintName) || clean(business?.name),
    locationName: clean(location?.name),
    businessId: uuidOf(business?._id || grc.businessId),
    locationId: uuidOf(location?._id || grc.locationId),
    stockPointId: uuidOf(stockPoint?._id || grc.stockPointId),
    stockPointName: clean(stockPoint?.stockPoint || grc.stockPointName),
    addressLine1: clean(location?.addressLine1) || clean(business?.addressLine1),
    addressLine2: clean(location?.addressLine2) || clean(business?.addressLine2),
    city: clean(location?.city) || clean(business?.city),
    state: clean(location?.state) || clean(business?.state),
    zipCode: clean(location?.zipCode) || clean(business?.zipCode),
    mobile: clean(location?.mobile)
      || clean(location?.alternateContactNumber)
      || clean(business?.mobile)
      || clean(business?.alternateContactNumber),
    gstin: clean(location?.gstin) || clean(business?.gstin),
    /* where the branch details above actually came from - useful to the
       screen and to the tests, never printed */
    source: location ? 'location' : (business ? 'business' : 'none'),
  };

  const supplierName = clean(supplier?.businessName)
    || [supplier?.firstName, supplier?.lastName].filter(Boolean).join(' ').trim();

  return {
    grc: {
      id: uuidOf(grc._id),
      grcNumber: clean(grc.grcNumber),
      grcDate: grc.grcDate || null,
      vendorDocNo: clean(grc.vendorDocNo),
      vendorDocDate: grc.vendorDocDate || null,
      lrNo: clean(delivery?.lrNumber) || clean(grc.lrTransactionNo) || clean(delivery?.transactionNo),
      lrDate: delivery?.bookingDate || delivery?.transactionDate || null,
      lrTransactionNo: clean(grc.lrTransactionNo),
      stockPointName: clean(grc.stockPointName),
      totalQuantity: num(grc.totalQuantity),
      netAmount: num(grc.netAmount),
    },
    branch,
    supplier: {
      name: supplierName,
      addressLine1: clean(supplier?.billingAddressLine1),
      addressLine2: clean(supplier?.billingAddressLine2),
      city: clean(supplier?.billingCity),
      state: clean(supplier?.billingState),
      zipCode: clean(supplier?.billingZipCode),
      mobile: clean(supplier?.billingMobile)
        || clean(supplier?.billingAlternateContactNumber)
        || clean(supplier?.billingLandline),
      gstin: clean(supplier?.gstNo) || clean(grc.vendorGstNo),
    },
    items,
    totals: {
      qty: items.length ? summedQty : num(grc.totalQuantity),
      amount: items.length ? summedAmount : num(grc.netAmount),
      source: itemSource,
    },
  };
}
