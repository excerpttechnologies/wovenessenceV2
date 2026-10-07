// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import Item from '@/models/Item';
// import Hsn from '@/models/Hsn';
// import Uom from '@/models/Uom';
// import Tax from '@/models/Tax';
// import Business from '@/models/Business';
// import IcDeliveryChallan from '@/models/IcDeliveryChallan';
// import { BarcodeLabel } from '@/lib/barcodeLabel';
// import { requireSession } from '@/lib/session';
// import { escapeRegex } from '@/lib/validate';

// /* /api/ic-delivery-challan/item-lookup?code=<item code>&business=&location=&finYear=
//    &stockPoint=&toBusiness=

//    Everything one grid row needs the moment an item code is scanned:
//    item, HSN, GST slab percentages, UOM, unit rate and how much is left.

//    This covers the three rules in the screen's Info panel:

//      1. Item Code Validation - the code must appear in the GRC item list.
//         BarcodeLabel is where GRC lines live (see /api/barcode-generation),
//         so a code with no barcode row is rejected even if an Item master
//         record exists for it.

//      2. Stock Availability Check - maxQty below.

//      3. Unit Price Calculation - see the note on unitRate.                  */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// /* Available quantity.

//    v10 has no stock ledger - no model carries a running balance - so this is
//    derived: everything received for the code through GRC barcode rows, minus
//    whatever is already committed to inter company challans that have not been
//    invoiced away. It is the same figure the deployed screen prints as
//    "(Max: n)" under the QTY box.

//    When a real stock ledger lands, replace this one function and nothing else
//    on the screen has to change. */
// async function availableQty(itemCode, scope) {
//   const received = await BarcodeLabel.find({
//     itemCode,
//     ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
//     ...(scope.locationId ? { locationId: String(scope.locationId) } : {}),
//   }).select('qty').lean();

//   const inStock = received.reduce((a, r) => a + num(r.qty), 0);

//   /* already promised on open inter company challans */
//   const open = await IcDeliveryChallan.find({
//     ...(scope.businessId ? { businessId: scope.businessId } : {}),
//     ...(scope.locationId ? { locationId: scope.locationId } : {}),
//     ...(scope.finYear ? { finYear: scope.finYear } : {}),
//   }).select('items').lean();

//   const committed = open.reduce((a, dc) => {
//     const lines = Array.isArray(dc.items) ? dc.items : [];
//     return a + lines
//       .filter((l) => String(l.itemCode) === String(itemCode))
//       .reduce((s, l) => s + num(l.qty), 0);
//   }, 0);

//   return Math.max(0, Math.round((inStock - committed) * 100) / 100);
// }

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   const code = (sp.get('code') || '').trim();
//   if (!code) return json({ error: 'Enter an item code.' }, 400);

//   await dbConnect();

//   const business = sp.get('business');
//   const location = sp.get('location');
//   const scope = {
//     businessId: business && isValidObjectId(business) ? business : null,
//     locationId: location && isValidObjectId(location) ? location : null,
//     finYear: sp.get('finYear') || '',
//   };

//   /* rule 1 - the code must exist in the GRC item list */
//   const rx = { $regex: '^' + escapeRegex(code) + '$', $options: 'i' };
//   const barcodeRow = await BarcodeLabel.findOne({ itemCode: rx }).lean();
//   if (!barcodeRow) {
//     return json({ error: 'No GRC item found for "' + code + '". Receive it first.' }, 404);
//   }

//   const item = await Item.findOne({
//     itemCode: rx,
//     ...(scope.businessId ? { businessId: scope.businessId } : {}),
//   }).lean()
//     || await Item.findOne({ itemCode: rx }).lean();

//   if (!item) return json({ error: 'No item master record for "' + code + '".' }, 404);

//   const [hsn, uom] = await Promise.all([
//     item.hsnId ? Hsn.findById(item.hsnId).lean() : null,
//     item.uomId ? Uom.findById(item.uomId).lean() : null,
//   ]);

//   /* GST chain: HSN -> taxSlabs[].gstTaxNameId -> Tax.igst/cgst/sgst,
//      the same join /api/item/[id]/detail already does */
//   let slab = null;
//   if (hsn && Array.isArray(hsn.taxSlabs) && hsn.taxSlabs.length) {
//     const taxIds = hsn.taxSlabs.map((s) => s.gstTaxNameId).filter(Boolean);
//     const taxes = taxIds.length ? await Tax.find({ _id: { $in: taxIds } }).lean() : [];
//     const byId = new Map(taxes.map((t) => [String(t._id), t]));
//     const first = hsn.taxSlabs.find((s) => byId.has(String(s.gstTaxNameId)));
//     const t = first ? byId.get(String(first.gstTaxNameId)) : null;
//     if (t) {
//       slab = {
//         name: t.taxName || '',
//         igst: num(t.igst),
//         cgst: num(t.cgst),
//         sgst: num(t.sgst),
//       };
//     }
//   }

//   /* Inter-state supply carries IGST, intra-state splits into CGST + SGST.
//      Decided from the two GSTINs: the first two digits are the state code. */
//   let igstPct = 0;
//   let cgstPct = slab ? slab.cgst : 0;
//   let sgstPct = slab ? slab.sgst : 0;

//   const toBusiness = sp.get('toBusiness');
//   if (slab && toBusiness && isValidObjectId(toBusiness) && scope.businessId) {
//     const [from, to] = await Promise.all([
//       Business.findById(scope.businessId).select('gstin').lean(),
//       Business.findById(toBusiness).select('gstin').lean(),
//     ]);
//     const stateOf = (g) => String(g || '').slice(0, 2);
//     if (from?.gstin && to?.gstin && stateOf(from.gstin) !== stateOf(to.gstin)) {
//       igstPct = slab.igst;
//       cgstPct = 0;
//       sgstPct = 0;
//     }
//   }

//   /* rule 3 - unit price from the customer's pricing setup.

//      OPEN QUESTION. On this screen the customer is a BUSINESS, and the
//      Business model carries no pricing setup - markupPriceCalculation, the
//      RSP/WSP/DP markups and the round-off rules all live on Contact. The
//      item's RSP is used until that is settled.

//      To wire it up properly: decide where a branch's pricing setup lives
//      (either add those fields to Business, or map each branch to a Contact),
//      then swap the line below for the same markup calculation Contact uses. */
//   const unitRate = num(item.rsp);

//   return json({
//     item: {
//       itemId: String(item._id),
//       itemCode: item.itemCode || code,
//       itemName: item.name || '',
//       hsn: hsn ? hsn.code || '' : '',
//       slabName: slab ? slab.name : '',
//       uom: uom ? uom.shortName || uom.name || '' : '',
//       unitRate,
//       discountPct: 0,
//       roffDiscount: 0,
//       igstPct,
//       cgstPct,
//       sgstPct,
//       maxQty: await availableQty(item.itemCode || code, scope),
//     },
//   });
// }






import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import Hsn from '@/models/Hsn';
import Uom from '@/models/Uom';
import Tax from '@/models/Tax';
import Business from '@/models/Business';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

/* /api/ic-delivery-challan/item-lookup?code=<item code>&business=&location=&finYear=
   &stockPoint=&toBusiness=

   Everything one grid row needs the moment an item code is scanned:
   item, HSN, GST slab percentages, UOM, unit rate and how much is left.

   This covers the three rules in the screen's Info panel:

     1. Item Code Validation - the code must appear in the GRC item list.
        BarcodeLabel is where GRC lines live (see /api/barcode-generation),
        so a code with no barcode row is rejected even if an Item master
        record exists for it.

     2. Stock Availability Check - maxQty below.

     3. Unit Price Calculation - see the note on unitRate.                  */

const json = (d, s = 200) => Response.json(d, { status: s });
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* Item codes are typed by hand and scanned by gun, and the barcode rows were
   written by a different screen - so match on a trimmed, case-insensitive
   basis rather than on an exact string. */
const codeMatch = (code) => ({
  $regex: '^\\s*' + escapeRegex(String(code).trim()) + '\\s*$',
  $options: 'i',
});

/* BarcodeLabel stores businessId / locationId as plain strings defaulting to
   '' (see lib/barcodeLabel.js), and the barcode screen writes whatever the
   top bar happened to hold - which is '' when a row is saved before the
   location selector has resolved. Filtering on locationId therefore hides
   real stock, so stock is scoped by BUSINESS only, and rows carrying a blank
   business are treated as belonging to whoever is asking.

   That is a deliberate loosening, not an oversight: a per-location balance
   needs a stock ledger, which this project does not have. */
const stockScope = (scope) => (scope.businessId
  ? { $or: [
      { businessId: String(scope.businessId) },
      { businessId: '' },
      { businessId: { $exists: false } },
    ] }
  : {});

/* Available quantity.

   v10 has no stock ledger - no model carries a running balance - so this is
   derived: everything received for the code through GRC barcode rows, minus
   whatever is already committed to inter company challans that have not been
   invoiced away. It is the same figure the deployed screen prints as
   "(Max: n)" under the QTY box.

   When a real stock ledger lands, replace this one function and nothing else
   on the screen has to change. */
async function availableQty(itemCode, scope) {
  /* Item codes are matched case-insensitively everywhere else on this route,
     so they must be here too: an exact-string match against a code the Item
     master spells differently from the barcode row silently returns 0 stock
     while the item itself resolves fine. */
  const received = await BarcodeLabel.find({
    itemCode: codeMatch(itemCode),
    ...stockScope(scope),
  }).select('qty').lean();

  const inStock = received.reduce((a, r) => a + num(r.qty), 0);

  /* already promised on open inter company challans */
  const open = await IcDeliveryChallan.find({
    ...(scope.businessId ? { businessId: scope.businessId } : {}),
    ...(scope.locationId ? { locationId: scope.locationId } : {}),
    ...(scope.finYear ? { finYear: scope.finYear } : {}),
  }).select('items').lean();

  const committed = open.reduce((a, dc) => {
    const lines = Array.isArray(dc.items) ? dc.items : [];
    return a + lines
      .filter((l) => String(l.itemCode).trim().toLowerCase()
        === String(itemCode).trim().toLowerCase())
      .reduce((s, l) => s + num(l.qty), 0);
  }, 0);

  return Math.max(0, Math.round((inStock - committed) * 100) / 100);
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const code = (sp.get('code') || '').trim();
  if (!code) return json({ error: 'Enter an item code.' }, 400);

  await dbConnect();

  const business = sp.get('business');
  const location = sp.get('location');
  const scope = {
    businessId: business && isValidObjectId(business) ? business : null,
    locationId: location && isValidObjectId(location) ? location : null,
    finYear: sp.get('finYear') || '',
  };

  /* rule 1 - the code must exist in the GRC item list */
  const rx = codeMatch(code);

  /* Scoped to THIS branch. A barcode row belonging to another branch is not
     stock you can ship from here, and letting it through produced the
     confusing "item resolves but Max is 0" case. */
  const barcodeRow = await BarcodeLabel.findOne({
    itemCode: codeMatch(code),
    ...stockScope(scope),
  }).lean();

  if (!barcodeRow) {
    /* distinguish "never received anywhere" from "not received HERE" */
    const elsewhere = await BarcodeLabel.findOne({ itemCode: rx }).lean();
    return json({
      error: elsewhere
        ? 'No stock of "' + code + '" at this business / location. Receive it here first.'
        : 'No GRC item found for "' + code + '". Receive it first.',
    }, 404);
  }

  const item = await Item.findOne({
    itemCode: rx,
    ...(scope.businessId ? { businessId: scope.businessId } : {}),
  }).lean()
    || await Item.findOne({ itemCode: rx }).lean();

  if (!item) return json({ error: 'No item master record for "' + code + '".' }, 404);

  const [hsn, uom] = await Promise.all([
    item.hsnId ? Hsn.findById(item.hsnId).lean() : null,
    item.uomId ? Uom.findById(item.uomId).lean() : null,
  ]);

  /* GST chain: HSN -> taxSlabs[].gstTaxNameId -> Tax.igst/cgst/sgst,
     the same join /api/item/[id]/detail already does */
  let slab = null;
  if (hsn && Array.isArray(hsn.taxSlabs) && hsn.taxSlabs.length) {
    const taxIds = hsn.taxSlabs.map((s) => s.gstTaxNameId).filter(Boolean);
    const taxes = taxIds.length ? await Tax.find({ _id: { $in: taxIds } }).lean() : [];
    const byId = new Map(taxes.map((t) => [String(t._id), t]));
    const first = hsn.taxSlabs.find((s) => byId.has(String(s.gstTaxNameId)));
    const t = first ? byId.get(String(first.gstTaxNameId)) : null;
    if (t) {
      slab = {
        name: t.taxName || '',
        igst: num(t.igst),
        cgst: num(t.cgst),
        sgst: num(t.sgst),
      };
    }
  }

  /* Inter-state supply carries IGST, intra-state splits into CGST + SGST.
     Decided from the two GSTINs: the first two digits are the state code. */
  let igstPct = 0;
  let cgstPct = slab ? slab.cgst : 0;
  let sgstPct = slab ? slab.sgst : 0;

  const toBusiness = sp.get('toBusiness');
  if (slab && toBusiness && isValidObjectId(toBusiness) && scope.businessId) {
    const [from, to] = await Promise.all([
      Business.findById(scope.businessId).select('gstin').lean(),
      Business.findById(toBusiness).select('gstin').lean(),
    ]);
    const stateOf = (g) => String(g || '').slice(0, 2);
    if (from?.gstin && to?.gstin && stateOf(from.gstin) !== stateOf(to.gstin)) {
      igstPct = slab.igst;
      cgstPct = 0;
      sgstPct = 0;
    }
  }

  /* rule 3 - unit price from the customer's pricing setup.

     OPEN QUESTION. On this screen the customer is a BUSINESS, and the
     Business model carries no pricing setup - markupPriceCalculation, the
     RSP/WSP/DP markups and the round-off rules all live on Contact. The
     item's RSP is used until that is settled.

     To wire it up properly: decide where a branch's pricing setup lives
     (either add those fields to Business, or map each branch to a Contact),
     then swap the line below for the same markup calculation Contact uses. */
  const unitRate = num(item.rsp);

  return json({
    item: {
      itemId: String(item._id),
      itemCode: item.itemCode || code,
      itemName: item.name || '',
      hsn: hsn ? hsn.code || '' : '',
      slabName: slab ? slab.name : '',
      uom: uom ? uom.shortName || uom.name || '' : '',
      unitRate,
      discountPct: 0,
      roffDiscount: 0,
      igstPct,
      cgstPct,
      sgstPct,
      maxQty: await availableQty(item.itemCode || code, scope),
    },
  });
}