// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import Item from '@/models/Item';
// import Hsn from '@/models/Hsn';
// import Uom from '@/models/Uom';
// import Tax from '@/models/Tax';
// import Business from '@/models/Business';
// import IcDeliveryChallan from '@/models/IcDeliveryChallan';
// import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
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
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { imageUrl } from '@/lib/inventory';

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

const json = (d, s = 200) => Response.json(d, {
  status: s,
  /* a stock lookup must never be answered from a cache */
  headers: { 'Cache-Control': 'no-store' },
});
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

/* NOTE: a branch-wide availableQty() used to live here, summing every
   in-stock barcode row for an item code and subtracting what open challans
   had already committed. Entry is per-barcode now, so the ceiling is simply
   that barcode's own quantity and the aggregate is no longer consulted.
   Recover it from git if a per-item-code balance is ever needed again. */

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

  /* rule 1 - the code must exist in the GRC item list.

     What gets typed here is a BARCODE NUMBER. barcodeNo is carried by every
     barcodeLabel row; barcodeGenerated and oldBarcode are only populated on
     some of them, so all three are tried. An item code is still accepted as
     a fallback - the two namespaces do not overlap, and operators who know a
     code should not be blocked from using it. */
  const rx = codeMatch(code);

  /* Scoped to THIS branch. A barcode row belonging to another branch is not
     stock you can ship from here, and letting it through produced the
     confusing "item resolves but Max is 0" case. */
  /* $and, NEVER a spread of two clauses that both use $or.

     stockScope() returns its own { $or: [...] } for the business, so

         { ...byBarcode, status, ...stockScope(scope) }

     produced ONE object whose $or key was overwritten by the business
     clause - the barcode condition vanished entirely and the query became
     "first in-stock row at this branch". Every barcode scanned came back as
     the same row (PR0144SU), which is exactly what the challan kept showing. */
  const scoped = (clause) => ({
    $and: [clause, { status: BARCODE_STATUS.IN_STOCK }, stockScope(scope)]
      .filter((c) => Object.keys(c).length),
  });

  const byBarcode = {
    $or: [{ barcodeNo: rx }, { barcodeGenerated: rx }, { oldBarcode: rx }],
  };

  const barcodeRow = await BarcodeLabel.findOne(scoped(byBarcode)).lean();

  /* NO item-code fallback.

     It used to pick the first in-stock unit carrying that item code, so
     typing "sk-10" silently put barcode PR0144SU on the challan - a unit the
     operator never chose and cannot see the reason for. What goes in the
     Barcode column must be what was scanned. An item code now gets told what
     it is, and the type-ahead lists that code's actual barcodes to pick from. */
  if (!barcodeRow) {
    const asItemCode = await BarcodeLabel.findOne(scoped({ itemCode: rx })).lean();

    if (asItemCode) {
      return json({
        error: '"' + code + '" is an item code, not a barcode. Type it again and'
          + ' pick one of its barcodes from the list.',
        code: 'IS_ITEM_CODE',
      }, 404);
    }
  }

  if (!barcodeRow) {
    /* Say WHICH of the three things went wrong rather than one blanket
       message: never seen at all / not at this branch / already gone. */
    const anywhere = await BarcodeLabel.findOne({
      $or: [{ barcodeNo: rx }, { barcodeGenerated: rx }, { oldBarcode: rx }, { itemCode: rx }],
    }).lean();

    if (!anywhere) {
      return json({ error: 'No barcode or item code "' + code + '" was found. Receive it first.' }, 404);
    }
    if (anywhere.status && anywhere.status !== BARCODE_STATUS.IN_STOCK) {
      return json({
        error: '"' + code + '" is not in stock (' + anywhere.status + ').',
      }, 404);
    }
    return json({
      error: 'No stock of "' + code + '" at this business / location. Receive it here first.',
    }, 404);
  }

  /* The barcode row is the authority on WHICH item this is - what was typed
     may have been a barcode, which the Item master knows nothing about. */
  const itemRx = codeMatch(barcodeRow.itemCode || code);

  /* The Item master is ENRICHMENT here, not a requirement.

     It holds 144 rows against 23,913 barcode rows and almost all of them have
     a blank itemCode, so requiring a match would reject very nearly every
     barcode. The barcode row already carries the description, HSN, GST
     percentage, UOM and retail price captured when the goods were received,
     which is everything a challan line needs. Item master values win where
     they exist; the barcode row fills the gaps. */
  /* Match on itemCode OR name.

     The Item master keeps the code in `name` - 15-SVNS, 10-GPBT - and leaves
     `itemCode` blank on 142 of its 145 rows. Matching itemCode alone found
     ONE barcode code out of 21,024; adding name finds 50, and those rows
     carry a real hsnId and uomId (145 and 143 of 145 have them) rather than
     the barcode row's free text. */
  const byCodeOrName = { $or: [{ itemCode: itemRx }, { name: itemRx }] };

  const item = await Item.findOne({
    ...byCodeOrName,
    ...(scope.businessId ? { businessId: scope.businessId } : {}),
  }).lean()
    || await Item.findOne(byCodeOrName).lean()
    || null;

  const [hsn, uom] = await Promise.all([
    item && item.hsnId ? Hsn.findById(item.hsnId).lean() : null,
    item && item.uomId ? Uom.findById(item.uomId).lean() : null,
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

  /* No HSN chain to walk - the barcode row stores the rate the goods were
     received at, as a plain percentage string ("5"). Intra-state splits it in
     half, which is what the HSN-driven branch above produces too. */
  if (!slab) {
    const pct = num(barcodeRow.gst);
    if (pct) slab = { name: pct + '%', igst: pct, cgst: pct / 2, sgst: pct / 2 };
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
  const unitRate = num(item && item.rsp) || num(barcodeRow.retailPrice);

  /* How much of THIS BARCODE the branch holds.

     Not the single row's quantity: the same printed barcode is spread over
     one row per physical unit received, so 8A1000 is ten rows of 1 rather
     than one row of 10. Summing them is what lets the operator scan the same
     label ten times and ship ten units. */
  /* Match on the resolved barcode only, and ONLY on fields that actually
     carry it. codeMatch('') is /^\s*\s*$/ - it matches every EMPTY string,
     so including a blank barcodeGenerated in this $or swept up every row with
     no generated barcode and reported the whole branch's stock (24,260) as
     the ceiling for a single unit. */
  const label = String(barcodeRow.barcodeNo || barcodeRow.barcodeGenerated || code).trim();
  const heldOr = [];
  if (barcodeRow.barcodeNo) heldOr.push({ barcodeNo: codeMatch(label) });
  if (barcodeRow.barcodeGenerated) heldOr.push({ barcodeGenerated: codeMatch(label) });

  /* $and, not a spread. stockScope() returns its own { $or: [...] }, so
     spreading it beside `$or: heldOr` silently replaced the barcode clause
     with the business clause - the match became "every row at this branch"
     and every barcode reported the branch's entire stock as its ceiling. */
  const held = heldOr.length
    ? await BarcodeLabel.aggregate([
      { $match: scoped({ $or: heldOr }) },
      { $group: { _id: null, qty: { $sum: { $ifNull: ['$qtyNum', 0] } } } },
    ])
    : [];

  const barcodeQty = Math.round((Number(held[0] && held[0].qty) || 0) * 100) / 100
    || Number(barcodeRow.qtyNum) || Number(barcodeRow.qty) || 0;

  return json({
    item: {
      /* exactly the barcode that was scanned - this is what the grid's
         Barcode column prints */
      barcodeNo: barcodeRow.barcodeNo || barcodeRow.barcodeGenerated || '',
      /* The product photo, resolved EXACTLY as the POS scan resolves it
         (lib/inventory.js shapes its unit with this same call): the photo the
         mobile app wrote onto the barcode row, else the file shipped under
         public/august_8A_images/<barcode>.jpg, else ''. */
      image: imageUrl(
        barcodeRow.imageUrl || barcodeRow.filePath || '',
        barcodeRow.barcodeNo || barcodeRow.barcodeGenerated,
        barcodeRow.oldBarcode
      ),
      itemId: item ? String(item._id) : '',
      itemCode: (item && item.itemCode) || barcodeRow.itemCode || code,
      itemName: (item && item.name)
        || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
      hsn: (hsn && hsn.code) || barcodeRow.hsn || '',
      slabName: slab ? slab.name : '',
      uom: (uom && (uom.shortName || uom.name)) || barcodeRow.uom || barcodeRow.uomType || '',
      /* The three facts the grid needs to decide whether the quantity box is
         editable - see the rule in components/IcChallanForm.jsx.

         uomType is PC or MTR, the only two values in the data. Kept separate
         from `uom`, which is a free-text label ("Pc(s)", "Mtr", "METERS")
         and cannot be compared against reliably.

         qtyNum is THIS label's own quantity, not the branch total in maxQty:
         a label covering 5 metres can be part-shipped, a label covering one
         piece cannot. */
      uomType: barcodeRow.uomType || '',
      batchType: barcodeRow.batchType || '',
      qtyNum: Number(barcodeRow.qtyNum) || Number(barcodeRow.qty) || 0,
      unitRate,
      discountPct: 0,
      roffDiscount: 0,
      igstPct,
      cgstPct,
      sgstPct,
      maxQty: barcodeQty,
    },
  });
}