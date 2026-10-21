// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { BarcodeLabel } from '@/lib/barcodeLabel';
// // import StockMovement from '@/models/StockMovement';
// // import Item from '@/models/Item';
// // import CompanyLocation from '@/models/CompanyLocation';
// // import { Supplier } from '@/lib/contacts';
// // import { requireSession } from '@/lib/session';
// // import { barcodeFilter } from '@/lib/inventory';

// // /* /api/reports/barcode-detail?barcodeNo=<no>&business=<id>

// //    ONE BARCODE, IN FULL: the row itself, the names behind its ids, and every
// //    movement it has ever been part of. This is what the Barcode Report shows
// //    when it is opened from a barcode link on the Master Stock Report.

// //    Separate from /api/reports/barcode-report, which lists MANY barcodes for one
// //    item code. That one answers "what barcodes does this item have"; this one
// //    answers "what has happened to this piece". */

// // const json = (d, s = 200) => Response.json(d, { status: s });
// // const str = (v) => String(v ?? '').trim();

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   const code = str(sp.get('barcodeNo'));
// //   if (!code) return json({ error: 'No barcode given.' }, 400);

// //   await dbConnect();

// //   const business = sp.get('business');

// //   /* Matched on every spelling the number can take - its own number, the
// //      composed value the bars carry, or the vendor's old printed one - which is
// //      the same rule the till scans by. See lib/barcodeValue. */
// //   const unit = await BarcodeLabel.findOne({
// //     ...barcodeFilter([code]),
// //     ...(business && isValidObjectId(business) ? { businessId: business } : {}),
// //   }).lean();

// //   if (!unit) return json({ error: 'Barcode ' + code + ' was not found.' }, 404);

// //   /* The labels behind the ids. Each is optional: a row whose item or location
// //      has since been deleted still has to render, so a missing name falls back
// //      to what the barcode row itself carries. */
// //   const [item, currentLoc, originLoc, supplier] = await Promise.all([
// //     unit.itemId && isValidObjectId(String(unit.itemId))
// //       ? Item.findById(unit.itemId).select('name itemCode description imageUrl').lean() : null,
// //     /* currentLocationId is where the piece is NOW; locationId is where it was
// //        generated, which the screen shows as its origin. */
// //     unit.currentLocationId && isValidObjectId(String(unit.currentLocationId))
// //       ? CompanyLocation.findById(unit.currentLocationId).select('name').lean() : null,
// //     unit.locationId && isValidObjectId(String(unit.locationId))
// //       ? CompanyLocation.findById(unit.locationId).select('name').lean() : null,
// //     unit.supplierId && isValidObjectId(String(unit.supplierId))
// //       ? Supplier.findById(unit.supplierId).select('businessName firstName lastName contactId').lean() : null,
// //   ]);

// //   /* The trail, oldest first - it reads as a story that way, and the running
// //      balance below only makes sense in that order. Matched on the barcode row's
// //      id when there is one and on the number as well, because movements written
// //      before the id was denormalised carry only the number. */
// //   const movements = await StockMovement.find({
// //     $or: [
// //       ...(unit._id ? [{ barcodeId: unit._id }] : []),
// //       { barcodeNo: str(unit.barcodeNo) || code },
// //     ],
// //   }).sort({ createdAt: 1 }).lean();

// //   const locIds = [...new Set(
// //     movements.flatMap((m) => [m.fromLocationId, m.toLocationId])
// //       .filter((v) => v && isValidObjectId(String(v)))
// //       .map(String)
// //   )];
// //   const locs = locIds.length
// //     ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
// //     : [];
// //   const locName = new Map(locs.map((l) => [String(l._id), l.name]));

// //   /* Receipts and issues are the two halves of the signed qty the ledger
// //      stores, and the balance is their running sum - so the last row of the
// //      table is the quantity the barcode holds today. */
// //   let balance = 0;
// //   const rows = movements.map((m) => {
// //     const qty = Number(m.qty || 0);
// //     balance += qty;
// //     const at = qty >= 0 ? m.toLocationId : m.fromLocationId;
// //     return {
// //       _id: String(m._id),
// //       location: locName.get(String(at)) || '',
// //       docDate: m.createdAt || null,
// //       docNo: m.refNo || '',
// //       message: m.type || '',
// //       stockPoint: m.stockPoint || m.reason || '',
// //       receipts: qty > 0 ? qty : null,
// //       issues: qty < 0 ? Math.abs(qty) : null,
// //       balanceQty: balance,
// //       finalPrice: Number(unit.purRate || 0),
// //       netAmount: Math.abs(qty) * Number(unit.purRate || 0),
// //     };
// //   });

// //   const supplierName = supplier
// //     ? [supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')]
// //       .filter(Boolean)
// //       .concat(supplier.contactId ? ['[' + supplier.contactId + ']'] : [])
// //       .join(' ')
// //     : str(unit.supplierId);

// //   return json({
// //     detail: {
// //       itemName: item?.name || str(unit.itemName) || str(unit.itemCode),
// //       itemCode: str(unit.itemCode) || item?.itemCode || '',
// //       barcodeNo: str(unit.barcodeNo),
// //       barcodeGenerated: str(unit.barcodeGenerated),
// //       description: str(unit.printDescription) || str(unit.supplierDescription)
// //         || item?.description || '',
// //       hsn: str(unit.hsn),
// //       gst: unit.gst ?? '',
// //       uom: str(unit.uom),
// //       status: str(unit.status),
// //       quantity: Number(unit.qty || 0),
// //       imageUrl: str(unit.imageUrl) || item?.imageUrl || '',

// //       purchaseRate: unit.purRate ?? null,
// //       rsp: unit.retailPrice ?? null,
// //       offerPrice: unit.offerPrice ?? null,
// //       wsp: unit.wspPrice ?? null,

// //       supplierName,
// //       currentLocation: currentLoc?.name || '',
// //       originLocation: originLoc?.name || '',
// //       grcNo: str(unit.grcNo),
// //       grcDate: unit.createdAt || null,
// //       serialNo: unit.serialNo ?? unit.billSlNo ?? '',
// //       batchNo: str(unit.batchNo),
// //       transferNo: str(unit.transferNo),
// //       billingNo: str(unit.billingNo),
// //     },
// //     movements: rows,
// //   });
// // }



















// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { BarcodeLabel } from '@/lib/barcodeLabel';
// import StockMovement from '@/models/StockMovement';
// import Item from '@/models/Item';
// import ProductGroup from '@/models/ProductGroup';
// import Hsn from '@/models/Hsn';
// import Tax from '@/models/Tax';
// import CompanyLocation from '@/models/CompanyLocation';
// import { Supplier } from '@/lib/contacts';
// import { requireSession } from '@/lib/session';
// import { barcodeFilter } from '@/lib/inventory';

// /* /api/reports/barcode-detail?barcodeNo=<no>&business=<id>

//    ONE BARCODE, IN FULL: the row itself, the names behind its ids, and every
//    movement it has ever been part of. This is what the Barcode Report shows
//    when it is opened from a barcode link on the Master Stock Report.

//    Separate from /api/reports/barcode-report, which lists MANY barcodes for one
//    item code. That one answers "what barcodes does this item have"; this one
//    answers "what has happened to this piece". */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const str = (v) => String(v ?? '').trim();

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   const code = str(sp.get('barcodeNo'));
//   if (!code) return json({ error: 'No barcode given.' }, 400);

//   await dbConnect();

//   const business = sp.get('business');

//   /* Matched on every spelling the number can take - its own number, the
//      composed value the bars carry, or the vendor's old printed one - which is
//      the same rule the till scans by. See lib/barcodeValue. */
//   const unit = await BarcodeLabel.findOne({
//     ...barcodeFilter([code]),
//     ...(business && isValidObjectId(business) ? { businessId: business } : {}),
//   }).lean();

//   if (!unit) return json({ error: 'Barcode ' + code + ' was not found.' }, 404);

//   /* The labels behind the ids. Each is optional: a row whose item or location
//      has since been deleted still has to render, so a missing name falls back
//      to what the barcode row itself carries. */
//   const [item, currentLoc, originLoc, supplier] = await Promise.all([
//     unit.itemId && isValidObjectId(String(unit.itemId))
//       ? Item.findById(unit.itemId).select('name itemCode description imageUrl subGroupId hsnId').lean() : null,
//     /* currentLocationId is where the piece is NOW; locationId is where it was
//        generated, which the screen shows as its origin. */
//     unit.currentLocationId && isValidObjectId(String(unit.currentLocationId))
//       ? CompanyLocation.findById(unit.currentLocationId).select('name').lean() : null,
//     unit.locationId && isValidObjectId(String(unit.locationId))
//       ? CompanyLocation.findById(unit.locationId).select('name').lean() : null,
//     unit.supplierId && isValidObjectId(String(unit.supplierId))
//       ? Supplier.findById(unit.supplierId).select('businessName firstName lastName contactId billingState').lean() : null,
//   ]);

//   /* Item Info's Sub Group / Group / GST Slab - the item's masters (a barcode
//      keeps no group of its own). The slab is the item's HSN's tax, else the
//      barcode's own GST %. */
//   const sub = item?.subGroupId && isValidObjectId(String(item.subGroupId))
//     ? await ProductGroup.findById(item.subGroupId).select('name parentId').lean() : null;
//   const group = sub?.parentId && isValidObjectId(String(sub.parentId))
//     ? await ProductGroup.findById(sub.parentId).select('name').lean() : null;
//   const hsn = item?.hsnId && isValidObjectId(String(item.hsnId))
//     ? await Hsn.findById(item.hsnId).select('taxSlabs').lean() : null;
//   const slabId = hsn?.taxSlabs?.[0]?.gstTaxNameId;
//   const slab = slabId && isValidObjectId(String(slabId)) ? await Tax.findById(slabId).select('taxName').lean() : null;

//   /* The trail, oldest first - it reads as a story that way, and the running
//      balance below only makes sense in that order. Matched on the barcode row's
//      id when there is one and on the number as well, because movements written
//      before the id was denormalised carry only the number. */
//   const movements = await StockMovement.find({
//     $or: [
//       ...(unit._id ? [{ barcodeId: unit._id }] : []),
//       { barcodeNo: str(unit.barcodeNo) || code },
//     ],
//   }).sort({ createdAt: 1 }).lean();

//   const locIds = [...new Set(
//     movements.flatMap((m) => [m.fromLocationId, m.toLocationId])
//       .filter((v) => v && isValidObjectId(String(v)))
//       .map(String)
//   )];
//   const locs = locIds.length
//     ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
//     : [];
//   const locName = new Map(locs.map((l) => [String(l._id), l.name]));

//   /* Receipts and issues are the two halves of the signed qty the ledger
//      stores, and the balance is their running sum - so the last row of the
//      table is the quantity the barcode holds today. */
//   let balance = 0;
//   const rows = movements.map((m) => {
//     const qty = Number(m.qty || 0);
//     balance += qty;
//     const at = qty >= 0 ? m.toLocationId : m.fromLocationId;
//     return {
//       _id: String(m._id),
//       location: locName.get(String(at)) || '',
//       docDate: m.createdAt || null,
//       docNo: m.refNo || '',
//       message: m.type || '',
//       stockPoint: m.stockPoint || m.reason || '',
//       receipts: qty > 0 ? qty : null,
//       issues: qty < 0 ? Math.abs(qty) : null,
//       balanceQty: balance,
//       finalPrice: Number(unit.purRate || 0),
//       netAmount: Math.abs(qty) * Number(unit.purRate || 0),
//     };
//   });

//   const supplierName = supplier
//     ? [supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')]
//       .filter(Boolean)
//       .concat(supplier.contactId ? ['[' + supplier.contactId + ']'] : [])
//       .join(' ')
//     : str(unit.supplierId);

//   return json({
//     detail: {
//       itemName: item?.name || str(unit.itemName) || str(unit.itemCode),
//       itemCode: str(unit.itemCode) || item?.itemCode || '',
//       barcodeNo: str(unit.barcodeNo),
//       barcodeGenerated: str(unit.barcodeGenerated),
//       description: str(unit.printDescription) || str(unit.supplierDescription)
//         || item?.description || '',
//       hsn: str(unit.hsn),
//       gst: unit.gst ?? '',
//       uom: str(unit.uom),
//       status: str(unit.status),
//       quantity: Number(unit.qty || 0),
//       imageUrl: str(unit.imageUrl) || item?.imageUrl || '',

//       purchaseRate: unit.purRate ?? null,
//       rsp: unit.retailPrice ?? null,
//       offerPrice: unit.offerPrice ?? null,
//       wsp: unit.wsp || unit.wspPrice || null,
//       discount: unit.discount ?? unit.disc ?? null,
//       finalRate: unit.finalNet ?? null,
//       dp: unit.dp || unit.dpPrice || null,

//       subGroup: sub?.name || '',
//       group: group?.name || '',
//       gstSlab: slab?.taxName || (str(unit.gst) ? 'GST ' + str(unit.gst) + ' %' : ''),
//       pma: str(unit.p_m_f),
//       designNo: str(unit.designNo),
//       taxRegion: str(unit.supplierTaxRegion) || str(supplier?.billingState),
//       source: str(unit.source),

//       supplierName,
//       currentLocation: currentLoc?.name || '',
//       originLocation: originLoc?.name || '',
//       grcNo: str(unit.grcNo),
//       grcDate: unit.createdAt || null,
//       serialNo: unit.serialNo ?? unit.billSlNo ?? '',
//       batchNo: str(unit.batchNo),
//       transferNo: str(unit.transferNo),
//       billingNo: str(unit.billingNo),
//     },
//     movements: rows,
//     /* what the other ERP's Details page said about a unit imported from it
//        (Barcode Report -> Import): its own movements, their totals and its
//        stock by location - history, apart from this ERP's ledger above */
//     history: unit.sourceMovements?.length || unit.sourceStock?.length ? {
//       movements: (unit.sourceMovements || []).map((m) => ({ ...m, locationId: undefined, stockPointId: undefined })),
//       totals: unit.sourceTotals || null,
//       stock: (unit.sourceStock || []).map((s) => ({ ...s, locationId: undefined, stockPointId: undefined })),
//     } : null,
//   });
// }











import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement from '@/models/StockMovement';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import CompanyLocation from '@/models/CompanyLocation';
import { Supplier } from '@/lib/contacts';
import { requireSession } from '@/lib/session';
import { barcodeFilter, unitFor, imageUrl, withTransaction, MOVEMENT_TYPES } from '@/lib/inventory';
import { barcodeImageSrc } from '@/lib/barcodeImageService';
import { handler } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { screenDenial, screenDenialAny, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/reports/barcode-detail?barcodeNo=<no>&business=<id>

   ONE BARCODE, IN FULL: the row itself, the names behind its ids, and every
   movement it has ever been part of. This is what the Barcode Report shows
   when it is opened from a barcode link on the Master Stock Report.

   Separate from /api/reports/barcode-report, which lists MANY barcodes for one
   item code. That one answers "what barcodes does this item have"; this one
   answers "what has happened to this piece". */

const json = (d, s = 200) => Response.json(d, { status: s });
const str = (v) => String(v ?? '').trim();

export const PATCH = handler(async (req) => {
  const body = await req.json();
  const unitId = str(body.unitId);
  if (!isValidObjectId(unitId)) return json({ error: 'A valid barcode is required.' }, 422);

  await dbConnect();
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const initial = await BarcodeLabel.findById(unitId)
    .select('status businessId currentLocationId locationId barcodeNo')
    .lean();
  if (!initial) return json({ error: 'That barcode no longer exists.' }, 404);
  if (body.business && String(initial.businessId || '') !== String(body.business)) {
    return json({ error: 'That barcode belongs to another business.' }, 403);
  }
  await requirePermission(PERMISSIONS.BARCODE_GENERATE, {
    locationId: String(initial.currentLocationId || initial.locationId || '') || undefined,
  });

  /* Roles & Permissions (17-10-2026): editing a barcode on its Details view
     also needs Barcode Report -> Update */
  const deniedEdit = await screenDenial({ session, screen: SCREENS.BARCODE_REPORT, label: 'the barcode report', action: PERM.UPDATE, businessId: initial.businessId });
  if (deniedEdit) return json({ error: deniedEdit.message, code: deniedEdit.code }, 403);

  if (initial.status !== BARCODE_STATUS.IN_STOCK) {
    return json({ error: 'Only barcodes currently in stock can be edited.' }, 409);
  }

  // Validate and prepare update fields
  const updates = {};
  const errors = [];

  // Quantity - required, must be non-negative number
  if (body.quantity !== undefined && body.quantity !== null && String(body.quantity).trim() !== '') {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      errors.push('Quantity must be a valid non-negative number.');
    } else {
      updates.qty = String(quantity);
      updates.qtyNum = quantity;
    }
  }

  // Text fields
  if (body.itemName !== undefined) updates.itemName = str(body.itemName);
  if (body.itemCode !== undefined) updates.itemCode = str(body.itemCode);
  if (body.description !== undefined) {
    updates.printDescription = str(body.description);
  }
  if (body.pma !== undefined) updates.p_m_f = str(body.pma);
  if (body.designNo !== undefined) updates.designNo = str(body.designNo);
  if (body.hsn !== undefined) updates.hsn = str(body.hsn);
  if (body.uom !== undefined) updates.uom = str(body.uom);
  if (body.status !== undefined) updates.status = str(body.status);

  // Numeric price fields - must be non-negative if provided
  const priceFields = [
    { key: 'rsp', field: 'retailPrice', label: 'RSP' },
    { key: 'purchaseRate', field: 'purRate', label: 'Purchase Rate' },
    { key: 'discount', field: 'disc', label: 'Discount' },
    { key: 'finalRate', field: 'finalNet', label: 'Final Rate' },
    { key: 'offerPrice', field: 'offerPrice', label: 'Offer Price' },
    { key: 'wsp', field: 'wspPrice', label: 'WSP' },
    { key: 'dp', field: 'dpPrice', label: 'DP' },
    { key: 'gst', field: 'gst', label: 'GST %' },
  ];

  for (const { key, field, label } of priceFields) {
    if (body[key] !== undefined && body[key] !== null && String(body[key]).trim() !== '') {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`${label} must be a valid non-negative number.`);
      } else {
        updates[field] = key === 'gst' ? value : String(value);
      }
    }
  }

  // Barcode number - check uniqueness if changed
  if (body.barcodeNo !== undefined && str(body.barcodeNo) !== str(initial.barcodeNo)) {
    const newBarcodeNo = str(body.barcodeNo);
    if (!newBarcodeNo) {
      errors.push('Barcode number cannot be empty.');
    } else {
      // Check if another barcode already uses this number
      const existing = await BarcodeLabel.findOne({
        barcodeNo: newBarcodeNo,
        _id: { $ne: unitId },
        ...(initial.businessId && isValidObjectId(String(initial.businessId)) ? { businessId: initial.businessId } : {}),
      }).select('_id').lean();
      
      if (existing) {
        errors.push(`Barcode number ${newBarcodeNo} is already in use.`);
      } else {
        updates.barcodeNo = newBarcodeNo;
      }
    }
  }

  // Validate ObjectId references if provided
  if (body.subGroupId !== undefined && body.subGroupId !== null && String(body.subGroupId).trim() !== '') {
    if (!isValidObjectId(String(body.subGroupId))) {
      errors.push('Invalid Sub Group selection.');
    }
  }

  if (body.hsnId !== undefined && body.hsnId !== null && String(body.hsnId).trim() !== '') {
    if (!isValidObjectId(String(body.hsnId))) {
      errors.push('Invalid HSN selection.');
    }
  }

  if (body.uomId !== undefined && body.uomId !== null && String(body.uomId).trim() !== '') {
    if (!isValidObjectId(String(body.uomId))) {
      errors.push('Invalid UOM selection.');
    } else {
      updates.uomId = new Types.ObjectId(String(body.uomId));
    }
  }

  if (body.itemId !== undefined && body.itemId !== null && String(body.itemId).trim() !== '') {
    if (!isValidObjectId(String(body.itemId))) {
      errors.push('Invalid Item selection.');
    } else {
      updates.itemId = new Types.ObjectId(String(body.itemId));
    }
  }

  if (errors.length > 0) {
    return json({ error: errors.join(' ') }, 422);
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No fields to update.' }, 422);
  }

  const result = await withTransaction(async (dbSession) => {
    let query = BarcodeLabel.findById(unitId)
      .select('status businessId currentBusinessId currentLocationId locationId finYear itemId itemCode itemName uom batchType barcodeNo barcodeGenerated qty qtyNum retailPrice');
    if (dbSession) query = query.session(dbSession);
    const unit = await query.lean();
    if (!unit) return { error: json({ error: 'That barcode no longer exists.' }, 404) };
    if (unit.status !== BARCODE_STATUS.IN_STOCK) {
      return { error: json({ error: 'Only barcodes currently in stock can be edited.' }, 409) };
    }

    const options = dbSession ? { session: dbSession } : {};
    const updateResult = await BarcodeLabel.updateOne(
      { _id: unit._id, status: BARCODE_STATUS.IN_STOCK },
      { $set: updates },
      options
    );
    
    if (!updateResult.matchedCount) {
      return { error: json({ error: 'This barcode changed while you were editing. Reload it and try again.' }, 409) };
    }

    // Create stock movement if quantity changed
    if (updates.qtyNum !== undefined) {
      const oldQuantity = Number(unit.qtyNum ?? unit.qty ?? 0);
      const newQuantity = updates.qtyNum;
      const delta = newQuantity - oldQuantity;
      
      if (delta !== 0) {
        const locationId = unit.currentLocationId || unit.locationId || null;
        const businessId = unit.currentBusinessId || unit.businessId || '';
        const userId = isValidObjectId(String(session.id || '')) ? new Types.ObjectId(String(session.id)) : null;
        const movement = {
          businessId: isValidObjectId(String(businessId)) ? new Types.ObjectId(String(businessId)) : null,
          finYear: unit.finYear || '',
          type: delta > 0 ? MOVEMENT_TYPES.ADJUST_IN : MOVEMENT_TYPES.ADJUST_OUT,
          barcodeId: unit._id,
          barcodeNo: updates.barcodeNo || unit.barcodeNo || unit.barcodeGenerated || '',
          itemId: updates.itemId || unit.itemId || null,
          itemCode: updates.itemCode || unit.itemCode || '',
          itemName: updates.itemName || unit.itemName || '',
          uom: updates.uom || unit.uom || '',
          batchType: unit.batchType || '',
          qty: delta,
          fromLocationId: delta < 0 ? locationId : null,
          toLocationId: delta > 0 ? locationId : null,
          statusBefore: unit.status,
          statusAfter: unit.status,
          refModel: 'barcodeDetailEdit',
          refNo: updates.barcodeNo || unit.barcodeNo || unit.barcodeGenerated || '',
          reason: 'Barcode edited from detail page',
          notes: `Quantity changed from ${oldQuantity} to ${newQuantity}.`,
          userId,
          userName: session.name || '',
          userEmail: session.email || '',
          at: new Date(),
        };
        await StockMovement.create([movement], options);
      }
    }

    return { ok: true, updated: updates };
  });

  if (result.error) return result.error;
  return json(result);
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const code = str(sp.get('barcodeNo'));
  if (!code) return json({ error: 'No barcode given.' }, 400);

  await dbConnect();

  const business = sp.get('business');

  /* Roles & Permissions (17-10-2026): the Details view is opened from the
     Barcode Report and from the Master Stock Report's barcode links - Read
     on either lets it through */
  const denied = await screenDenialAny({
    session,
    screens: [SCREENS.BARCODE_REPORT, SCREENS.MASTER_STOCK_REPORT],
    action: PERM.READ,
    businessId: business,
    label: 'the barcode report',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  /* Matched on every spelling the number can take - its own number, the
     composed value the bars carry, or the vendor's old printed one - which is
     the same rule the till scans by. See lib/barcodeValue. When several rows
     answer, the one whose OWN number it is comes first (then its composed
     value, then an old barcode) - the till's order (lib/inventory.js
     unitFor) - so the unit shown, and the one its Barcode Image is saved on,
     is the one this number belongs to, never an arbitrary one. */
  const matches = await BarcodeLabel.find({
    ...barcodeFilter([code]),
    ...(business && isValidObjectId(business) ? { businessId: business } : {}),
  }).limit(50).lean();
  const unit = unitFor(matches, code) || matches[0] || null;

  if (!unit) return json({ error: 'Barcode ' + code + ' was not found.' }, 404);

  /* The labels behind the ids. Each is optional: a row whose item or location
     has since been deleted still has to render, so a missing name falls back
     to what the barcode row itself carries. */
  const [item, currentLoc, originLoc, supplier] = await Promise.all([
    unit.itemId && isValidObjectId(String(unit.itemId))
      ? Item.findById(unit.itemId).select('name itemCode description image subGroupId hsnId').lean() : null,
    /* currentLocationId is where the piece is NOW; locationId is where it was
       generated, which the screen shows as its origin. */
    unit.currentLocationId && isValidObjectId(String(unit.currentLocationId))
      ? CompanyLocation.findById(unit.currentLocationId).select('name').lean() : null,
    unit.locationId && isValidObjectId(String(unit.locationId))
      ? CompanyLocation.findById(unit.locationId).select('name').lean() : null,
    unit.supplierId && isValidObjectId(String(unit.supplierId))
      ? Supplier.findById(unit.supplierId).select('businessName firstName lastName contactId billingState').lean() : null,
  ]);

  /* Item Info's Sub Group / Group / GST Slab - the item's masters (a barcode
     keeps no group of its own). The slab is the item's HSN's tax, else the
     barcode's own GST %.

     The Item form stores its "Group" pick in item.subGroupId, and that pick can
     be a sub-group (parentId set) OR a top-level group picked outright from the
     product-group master - both live in the same collection, exactly the way
     the Master Stock Report reads Group Name as item.subGroupId's own name. A
     top-level group IS the item's Group; it is not a Sub Group with no parent.
     So Group resolves parent-of-sub when there is a parent, and the group doc
     itself when there is not - only then does Sub Group stay empty. */
  const sub = item?.subGroupId && isValidObjectId(String(item.subGroupId))
    ? await ProductGroup.findById(item.subGroupId).select('name parentId').lean() : null;
  const isSubGroup = Boolean(sub?.parentId && isValidObjectId(String(sub.parentId)));
  const group = isSubGroup
    ? await ProductGroup.findById(String(sub.parentId)).select('name').lean() : null;
  const hsn = item?.hsnId && isValidObjectId(String(item.hsnId))
    ? await Hsn.findById(item.hsnId).select('taxSlabs').lean() : null;
  const slabId = hsn?.taxSlabs?.[0]?.gstTaxNameId;
  const slab = slabId && isValidObjectId(String(slabId)) ? await Tax.findById(slabId).select('taxName').lean() : null;

  /* IDs for dropdown fields - so the edit form can pre-select the correct values */
  const subGroupId = sub?._id ? String(sub._id) : (item?.subGroupId ? String(item.subGroupId) : '');
  /* the Group id behind the display value: the parent's when the item's pick
     was a sub-group, the pick's own id when it was a top-level group, so the
     edit form preselects what actually holds */
  const groupId = group?._id ? String(group._id)
    : (isSubGroup && sub?.parentId ? String(sub.parentId)
    : (sub?._id ? String(sub._id) : ''));
  const hsnId = hsn?._id ? String(hsn._id) : (item?.hsnId ? String(item.hsnId) : '');
  const gstSlabId = slab?._id ? String(slab._id) : '';
  const uomId = item?.uomId ? String(item.uomId) : (unit.uomId && isValidObjectId(String(unit.uomId)) ? String(unit.uomId) : '');

  /* The trail, oldest first - it reads as a story that way, and the running
     balance below only makes sense in that order. Matched on the barcode row's
     id when there is one and on the number as well, because movements written
     before the id was denormalised carry only the number. */
  const movements = await StockMovement.find({
    $or: [
      ...(unit._id ? [{ barcodeId: unit._id }] : []),
      { barcodeNo: str(unit.barcodeNo) || code },
    ],
  }).sort({ createdAt: 1 }).lean();

  const locIds = [...new Set(
    movements.flatMap((m) => [m.fromLocationId, m.toLocationId])
      .filter((v) => v && isValidObjectId(String(v)))
      .map(String)
  )];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name]));

  /* Receipts and issues are the two halves of the signed qty the ledger
     stores, and the balance is their running sum - so the last row of the
     table is the quantity the barcode holds today. */
  let balance = 0;
  const rows = movements.map((m) => {
    const qty = Number(m.qty || 0);
    balance += qty;
    const at = qty >= 0 ? m.toLocationId : m.fromLocationId;
    return {
      _id: String(m._id),
      location: locName.get(String(at)) || '',
      docDate: m.createdAt || null,
      docNo: m.refNo || '',
      message: m.type || '',
      stockPoint: m.stockPoint || '',
      receipts: qty > 0 ? qty : null,
      issues: qty < 0 ? Math.abs(qty) : null,
      balanceQty: balance,
      finalPrice: Number(unit.purRate || 0),
      netAmount: Math.abs(qty) * Number(unit.purRate || 0),
    };
  });

  const supplierName = supplier
    ? [supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')]
      .filter(Boolean)
      .concat(supplier.contactId ? ['[' + supplier.contactId + ']'] : [])
      .join(' ')
    : str(unit.supplierId);

  /* THE BARCODE IMAGE - this barcode's own (barcodeLabel.imageUrl), as saved
     here or by the mobile app; nothing borrowed from the Item master. The
     item's picture, when it has one, is its own field beside it. */
  const barcodeImageUrl = barcodeImageSrc(unit.imageUrl);
  const itemImageUrl = imageUrl(str(item?.image));

  return json({
    detail: {
      /* the one row shown - what its Barcode Image is saved on */
      unitId: String(unit._id),
      barcodeImageUrl,
      /* as stored, never trimmed: the image is replaced or removed only
         while the barcode still holds exactly this (app/api/barcode-image) */
      barcodeImageStored: String(unit.imageUrl ?? ''),
      itemImageUrl,
      itemName: item?.name || str(unit.itemName) || str(unit.itemCode),
      itemCode: str(unit.itemCode) || item?.itemCode || '',
      barcodeNo: str(unit.barcodeNo),
      barcodeGenerated: str(unit.barcodeGenerated),
      /* Description comes from Print Description only. */
      description: str(unit.printDescription) || item?.description || '',
      hsn: str(unit.hsn),
      gst: unit.gst ?? '',
      uom: str(unit.uom),
      status: str(unit.status),
      quantity: Number(unit.qtyNum ?? unit.qty ?? 0),
      /* kept for any older reader: the barcode's image, else the item's */
      imageUrl: barcodeImageUrl || itemImageUrl,

      purchaseRate: unit.purRate ?? null,
      rsp: unit.retailPrice ?? null,
      offerPrice: unit.offerPrice ?? null,
      wsp: unit.wsp || unit.wspPrice || null,
      discount: unit.discount ?? unit.disc ?? null,
      finalRate: unit.finalNet ?? null,
      dp: unit.dp || unit.dpPrice || null,

      /* a top-level group picked outright is the Group - not a Sub Group */
      subGroup: (sub && isSubGroup ? sub.name : '') || '',
      group: group?.name || (sub && !isSubGroup ? sub.name : '') || '',
      gstSlab: slab?.taxName || (str(unit.gst) ? 'GST ' + str(unit.gst) + ' %' : ''),
      subGroupId,
      groupId,
      hsnId,
      gstSlabId,
      uomId,
      pma: str(unit.p_m_f),
      /* Design No. uses Supplier Description as its source (the "Supplier Description" label on the page),
         falling back to the dedicated designNo field if available. */
      designNo: str(unit.designNo || unit.supplierDescription),
      taxRegion: str(unit.supplierTaxRegion) || str(supplier?.billingState),
      source: str(unit.source),

      supplierName,
      currentLocation: currentLoc?.name || '',
      originLocation: originLoc?.name || '',
      grcNo: str(unit.grcNo),
      grcDate: unit.stockDate || unit.createdAt || null,
      stockAge: (unit.stockAge !== undefined && unit.stockAge !== null) ? unit.stockAge : null,
      serialNo: unit.serialNo ?? unit.billSlNo ?? '',
      batchNo: str(unit.batchNo),
      transferNo: str(unit.transferNo),
      billingNo: str(unit.billingNo),
    },
    movements: rows,
    /* what the other ERP's Details page said about a unit imported from it
       (Barcode Report -> Import): its own movements, their totals and its
       stock by location - history, apart from this ERP's ledger above */
    history: unit.sourceMovements?.length || unit.sourceStock?.length ? {
      movements: (unit.sourceMovements || []).map((m) => ({ ...m, locationId: undefined, stockPointId: undefined })),
      totals: unit.sourceTotals || null,
      stock: (unit.sourceStock || []).map((s) => ({ ...s, locationId: undefined, stockPointId: undefined })),
    } : null,
  });
}
