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
import Uom from '@/models/Uom';
import Tax from '@/models/Tax';
import CompanyLocation from '@/models/CompanyLocation';
import Business from '@/models/Business';
import { Supplier } from '@/lib/contacts';
import { requireSession } from '@/lib/session';
import { barcodeFilter, unitFor, imageUrl, withTransaction, MOVEMENT_TYPES } from '@/lib/inventory';
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
    .select('status businessId currentBusinessId companyId currentLocationId locationId barcodeNo itemId stockDate stockAge serialNo')
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

  /* THE COMPANY (user, 27-10-2026). The Details view used to show the unit's
     Current and Origin locations; it now shows the COMPANY it belongs to and
     the LOCATION inside that company. companyId is what the picker writes - a
     row saved before the picker existed answers with its owning business, so
     nothing had to be backfilled. */
  const currentCompanyId = String(initial.companyId || initial.currentBusinessId || initial.businessId || '');
  let companyId = currentCompanyId;
  if (body.companyId !== undefined && str(body.companyId) && str(body.companyId) !== currentCompanyId) {
    const askedCompanyId = str(body.companyId);
    if (!isValidObjectId(askedCompanyId)) return json({ error: 'Select a valid Company.' }, 422);
    const company = await Business.findById(askedCompanyId).select('_id name').lean();
    if (!company) return json({ error: 'The selected company does not exist.' }, 422);
    /* moving a unit into another company is the same right as editing it in
       the one the operator is signed in to - Barcode Report -> Update on the
       company it is going to */
    const deniedCompany = await screenDenial({
      session, screen: SCREENS.BARCODE_REPORT, label: 'the barcode report', action: PERM.UPDATE, businessId: askedCompanyId,
    });
    if (deniedCompany) return json({ error: deniedCompany.message, code: deniedCompany.code }, 403);
    companyId = askedCompanyId;
  }

  const linkedItem = initial.itemId && isValidObjectId(String(initial.itemId))
    ? await Item.findById(initial.itemId)
      .select('businessId name itemCode subGroupId hsnId uomId')
      .lean()
    : null;
  if (body.itemId !== undefined && String(body.itemId || '') !== String(initial.itemId || '')) {
    return json({ error: 'The item reference cannot be changed from the barcode detail page.' }, 422);
  }
  const itemMasterChanged = Boolean(linkedItem && (
    (body.itemName !== undefined && str(body.itemName) !== str(linkedItem.name)) ||
    (body.itemCode !== undefined && str(body.itemCode) !== str(linkedItem.itemCode)) ||
    (body.subGroupId !== undefined && str(body.subGroupId) !== String(linkedItem.subGroupId || '')) ||
    (body.hsnId !== undefined && str(body.hsnId) !== String(linkedItem.hsnId || '')) ||
    (body.uomId !== undefined && str(body.uomId) !== String(linkedItem.uomId || ''))
  ));
  if (itemMasterChanged) {
    const deniedItemEdit = await screenDenial({
      session,
      screen: SCREENS.ITEM,
      label: 'items',
      action: PERM.UPDATE,
      businessId: linkedItem.businessId || initial.businessId,
    });
    if (deniedItemEdit) {
      return json({ error: deniedItemEdit.message, code: deniedItemEdit.code }, 403);
    }
  }

  const currentLocationId = body.currentLocationId === undefined
    ? String(initial.currentLocationId || initial.locationId || '')
    : str(body.currentLocationId);
  /* The origin is history - where the unit was received. The screen no longer
     edits it, so it is written only when a caller sends it; and it is NOT
     checked against the company once that company changes, because a unit
     that moves to another company keeps an origin in the one it came from. */
  const companyChanged = companyId !== currentCompanyId;
  const originLocationId = body.originLocationId === undefined
    ? String(initial.locationId || '')
    : str(body.originLocationId);
  const locationIdsToValidate = [...new Set([
    currentLocationId,
    ...(companyChanged && body.originLocationId === undefined ? [] : [originLocationId]),
  ].filter(Boolean))];
  const invalidLocationIds = locationIdsToValidate.filter((id) => !isValidObjectId(id));
  if (invalidLocationIds.length) {
    return json({ error: 'Select a valid Company and Location.' }, 422);
  }
  if (!currentLocationId) {
    return json({ error: 'Select a Location for the selected Company.' }, 422);
  }
  /* the account must be allowed at the location the unit is about to hold,
     not only at the one it holds now */
  await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: currentLocationId });

  const locationDocs = locationIdsToValidate.length
    ? await CompanyLocation.find({ _id: { $in: locationIdsToValidate } })
      .select('_id businessId name')
      .lean()
    : [];
  /* the names the response answers with, so the screen can show what it just
     saved without asking for the barcode again (which, after a move to
     another company, the top bar's business would no longer find) */
  const savedCompany = companyId && isValidObjectId(companyId)
    ? await Business.findById(companyId).select('name').lean()
    : null;
  const locationById = new Map(locationDocs.map((location) => [String(location._id), location]));
  /* locations are checked against the COMPANY the save will leave the unit
     with, not the one it had before - so a company and a location picked
     together are judged as the pair they are */
  const ownerBusinessId = companyId;
  for (const locationId of locationIdsToValidate) {
    const location = locationById.get(locationId);
    if (!location) return json({ error: 'A selected location does not exist.' }, 422);
    if (
      ownerBusinessId &&
      location.businessId &&
      String(location.businessId) !== ownerBusinessId
    ) {
      return json({ error: 'The selected Location does not belong to the selected Company.' }, 422);
    }
  }

  // Validate and prepare update fields
  const updates = {};
  const itemUpdates = {};
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
  if (body.status !== undefined && str(body.status) !== str(initial.status)) {
    errors.push('Barcode status must be changed through the stock workflow.');
  }
  /* The company, when the picker moved the unit to another one. businessId is
     the plain string every stock report filters on, so it moves with the
     typed reference - one company, three spellings of it, always together. */
  if (companyId && isValidObjectId(companyId) && String(initial.companyId || '') !== companyId) {
    /* written even when the company did not change: a row saved before the
       picker existed gets its company recorded the first time it is saved */
    updates.companyId = new Types.ObjectId(companyId);
  }
  if (companyChanged) {
    updates.businessId = companyId;
    updates.currentBusinessId = new Types.ObjectId(companyId);
  }

  /* GRC DATE - the date the unit was received, which the details view shows
     and now edits. Stored where the screen already reads it from (stockDate),
     so every report sees the corrected date and not just this page. */
  if (body.grcDate !== undefined) {
    const raw = str(body.grcDate);
    if (!raw) {
      errors.push('Enter the GRC Date.');
    } else {
      const grcDate = new Date(raw);
      if (Number.isNaN(grcDate.getTime())) {
        errors.push('Enter a valid GRC Date.');
      } else if (grcDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        errors.push('The GRC Date cannot be in the future.');
      } else {
        updates.stockDate = grcDate;
      }
    }
  }

  /* AGE - days of stock. The screen works it out from the GRC Date unless the
     operator typed one, and either way the number saved here is the one the
     Master Stock Report's age filter reads. */
  if (body.age !== undefined) {
    const raw = str(body.age);
    if (!raw) {
      updates.stockAge = null;
    } else {
      const age = Number(raw);
      if (!Number.isInteger(age) || age < 0) {
        errors.push('Age must be a whole number of days, 0 or more.');
      } else if (age > 36500) {
        errors.push('Age must be 36500 days or fewer.');
      } else {
        updates.stockAge = age;
      }
    }
  }

  /* SERIAL NUMBER - free text on the unit; billSlNo stands in for a row that
     has none, so the field starts from what the screen shows. */
  if (body.serialNumber !== undefined) {
    const serial = str(body.serialNumber);
    if (serial.length > 60) errors.push('Serial Number must be 60 characters or fewer.');
    else updates.serialNo = serial;
  }

  const oldCurrentLocationId = String(initial.currentLocationId || initial.locationId || '');
  if (currentLocationId !== oldCurrentLocationId) {
    updates.currentLocationId = new Types.ObjectId(currentLocationId);
  }
  const oldOriginLocationId = String(initial.locationId || '');
  if (originLocationId !== oldOriginLocationId) {
    updates.locationId = originLocationId;
  }
  if (linkedItem && body.itemName !== undefined && str(body.itemName) !== str(linkedItem.name)) {
    if (!str(body.itemName)) errors.push('Item Name cannot be empty.');
    else itemUpdates.name = str(body.itemName);
  }
  if (linkedItem && body.itemCode !== undefined && str(body.itemCode) !== str(linkedItem.itemCode)) {
    if (!str(body.itemCode)) errors.push('Item Code cannot be empty.');
    else itemUpdates.itemCode = str(body.itemCode);
  }

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
  const hasGroupSelection = body.subGroupId !== undefined || body.groupId !== undefined;
  if (linkedItem && hasGroupSelection) {
    const subGroupId = str(body.subGroupId);
    const groupId = str(body.groupId);
    if (!isValidObjectId(subGroupId) || !isValidObjectId(groupId)) {
      errors.push('Select a valid Group and Sub Group.');
    } else {
      const [subGroup, group] = await Promise.all([
        ProductGroup.findById(subGroupId).select('businessId parentId').lean(),
        ProductGroup.findById(groupId).select('businessId parentId').lean(),
      ]);
      const ownerBusinessId = String(linkedItem.businessId || initial.businessId || '');
      const sameOwner = (master) => !master?.businessId || !ownerBusinessId
        || String(master.businessId) === ownerBusinessId;
      const relationshipMatches = subGroup?.parentId
        ? String(subGroup.parentId) === groupId
        : String(subGroup?._id || '') === groupId;
      if (!subGroup || !group || !sameOwner(subGroup) || !sameOwner(group) || !relationshipMatches) {
        errors.push('The selected Group and Sub Group are not a valid matching pair.');
      } else {
        itemUpdates.subGroupId = new Types.ObjectId(subGroupId);
      }
    }
  }

  if (linkedItem && body.hsnId !== undefined && str(body.hsnId) !== String(linkedItem.hsnId || '')) {
    const hsnId = str(body.hsnId);
    const hsn = isValidObjectId(hsnId)
      ? await Hsn.findById(hsnId).select('businessId code').lean()
      : null;
    const ownerBusinessId = String(linkedItem.businessId || initial.businessId || '');
    if (!hsn || (hsn.businessId && ownerBusinessId && String(hsn.businessId) !== ownerBusinessId)) {
      errors.push('Select a valid HSN for this business.');
    } else {
      itemUpdates.hsnId = new Types.ObjectId(hsnId);
      updates.hsn = str(hsn.code);
    }
  }

  if (linkedItem && body.uomId !== undefined && str(body.uomId) !== String(linkedItem.uomId || '')) {
    const uomId = str(body.uomId);
    const uom = isValidObjectId(uomId)
      ? await Uom.findById(uomId).select('businessId name shortName').lean()
      : null;
    const ownerBusinessId = String(linkedItem.businessId || initial.businessId || '');
    if (!uom || (uom.businessId && ownerBusinessId && String(uom.businessId) !== ownerBusinessId)) {
      errors.push('Select a valid UOM for this business.');
    } else {
      itemUpdates.uomId = new Types.ObjectId(uomId);
      updates.uomId = new Types.ObjectId(uomId);
      updates.uom = str(uom.shortName || uom.name);
    }
  }

  if (body.supplierId !== undefined) {
    const deniedSupplierRead = await screenDenial({
      session,
      screen: SCREENS.SUPPLIER,
      label: 'suppliers',
      action: PERM.READ,
      businessId: initial.businessId,
    });
    if (deniedSupplierRead) {
      return json({ error: deniedSupplierRead.message, code: deniedSupplierRead.code }, 403);
    }

    const supplierId = str(body.supplierId);
    if (!supplierId) {
      updates.supplierId = '';
    } else if (!isValidObjectId(supplierId)) {
      errors.push('Select a valid supplier.');
    } else {
      const supplier = await Supplier.findById(supplierId)
        .select('businessId')
        .lean();
      if (!supplier) {
        errors.push('The selected supplier does not exist.');
      } else if (
        initial.businessId &&
        String(supplier.businessId || '') !== String(initial.businessId)
      ) {
        errors.push('The selected supplier belongs to another business.');
      } else {
        updates.supplierId = supplierId;
      }
    }
  }

  if (body.taxRegion !== undefined) {
    const taxRegion = str(body.taxRegion);
    if (taxRegion.length > 120) {
      errors.push('Tax Region must be 120 characters or fewer.');
    } else {
      updates.supplierTaxRegion = taxRegion;
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
      .select('status businessId currentBusinessId companyId currentLocationId locationId finYear itemId itemCode itemName uom batchType barcodeNo barcodeGenerated qty qtyNum retailPrice stockDate stockAge serialNo');
    if (dbSession) query = query.session(dbSession);
    const unit = await query.lean();
    if (!unit) return { error: json({ error: 'That barcode no longer exists.' }, 404) };
    if (unit.status !== BARCODE_STATUS.IN_STOCK) {
      return { error: json({ error: 'Only barcodes currently in stock can be edited.' }, 409) };
    }

    const options = dbSession ? { session: dbSession } : {};
    const updateResult = await BarcodeLabel.updateOne(
      {
        _id: unit._id,
        status: BARCODE_STATUS.IN_STOCK,
        currentLocationId: unit.currentLocationId || null,
        locationId: unit.locationId || '',
      },
      { $set: updates },
      options
    );
    
    if (!updateResult.matchedCount) {
      return { error: json({ error: 'This barcode changed while you were editing. Reload it and try again.' }, 409) };
    }

    if (Object.keys(itemUpdates).length) {
      const itemResult = await Item.updateOne(
        { _id: unit.itemId },
        { $set: itemUpdates },
        options
      );
      if (!itemResult.matchedCount) {
        return { error: json({ error: 'The linked item no longer exists.' }, 409) };
      }
    }

    if (updates.currentLocationId !== undefined) {
      const fromLocationId = unit.currentLocationId || unit.locationId || null;
      const toLocationId = updates.currentLocationId;
      const quantity = Number(unit.qtyNum ?? unit.qty ?? 0);
      /* the company the save leaves the unit with - a move between companies
         and a move between locations in one save belong to the new one */
      const businessId = updates.currentBusinessId || updates.businessId
        || unit.currentBusinessId || unit.businessId || '';
      const userId = isValidObjectId(String(session.id || ''))
        ? new Types.ObjectId(String(session.id))
        : null;
      const movementBase = {
        businessId: isValidObjectId(String(businessId)) ? new Types.ObjectId(String(businessId)) : null,
        finYear: unit.finYear || '',
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
        itemId: unit.itemId || null,
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        batchType: unit.batchType || '',
        statusBefore: unit.status,
        statusAfter: unit.status,
        refModel: 'barcodeDetailEdit',
        refNo: unit.barcodeNo || unit.barcodeGenerated || '',
        reason: 'Current location corrected from Barcode Report',
        userId,
        userName: session.name || '',
        userEmail: session.email || '',
        at: new Date(),
      };
      const locationMovements = [];
      if (fromLocationId && quantity > 0) {
        locationMovements.push({
          ...movementBase,
          type: MOVEMENT_TYPES.ADJUST_OUT,
          qty: -quantity,
          fromLocationId,
          toLocationId: null,
          notes: `Barcode moved from ${fromLocationId} to ${toLocationId}.`,
        });
      }
      if (quantity > 0) {
        locationMovements.push({
          ...movementBase,
          type: MOVEMENT_TYPES.ADJUST_IN,
          qty: quantity,
          fromLocationId: null,
          toLocationId,
          notes: `Barcode moved from ${fromLocationId || 'unassigned'} to ${toLocationId}.`,
        });
      }
      if (locationMovements.length) {
        await StockMovement.create(locationMovements, options);
      }
    }

    if (updates.locationId !== undefined) {
      const businessId = updates.currentBusinessId || updates.businessId
        || unit.currentBusinessId || unit.businessId || '';
      const userId = isValidObjectId(String(session.id || ''))
        ? new Types.ObjectId(String(session.id))
        : null;
      await StockMovement.create([{
        businessId: isValidObjectId(String(businessId)) ? new Types.ObjectId(String(businessId)) : null,
        finYear: unit.finYear || '',
        type: MOVEMENT_TYPES.ORIGIN_CORRECTION,
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
        itemId: unit.itemId || null,
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        batchType: unit.batchType || '',
        qty: 0,
        fromLocationId: unit.locationId && isValidObjectId(String(unit.locationId))
          ? new Types.ObjectId(String(unit.locationId))
          : null,
        toLocationId: updates.locationId && isValidObjectId(String(updates.locationId))
          ? new Types.ObjectId(String(updates.locationId))
          : null,
        statusBefore: unit.status,
        statusAfter: unit.status,
        refModel: 'barcodeDetailEdit',
        refNo: unit.barcodeNo || unit.barcodeGenerated || '',
        reason: 'Origin location corrected from Barcode Report',
        notes: `Origin location changed from ${unit.locationId || 'unassigned'} to ${updates.locationId || 'unassigned'}.`,
        userId,
        userName: session.name || '',
        userEmail: session.email || '',
        at: new Date(),
      }], options);
    }

    /* THE COMPANY, GRC DATE, AGE OR SERIAL CHANGED - an audit row of its own,
       in the company the unit now belongs to. Nothing moved physically (qty
       0): this records WHO corrected what, exactly the way a location
       correction is recorded. */
    if ([
      updates.businessId, updates.stockDate, updates.stockAge, updates.serialNo,
    ].some((value) => value !== undefined)) {
      const userId = isValidObjectId(String(session.id || ''))
        ? new Types.ObjectId(String(session.id))
        : null;
      const auditBusinessId = updates.currentBusinessId || updates.businessId
        || unit.currentBusinessId || unit.businessId || '';
      await StockMovement.create([{
        businessId: isValidObjectId(String(auditBusinessId))
          ? new Types.ObjectId(String(auditBusinessId))
          : null,
        finYear: unit.finYear || '',
        type: MOVEMENT_TYPES.ORIGIN_CORRECTION,
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
        itemId: unit.itemId || null,
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        batchType: unit.batchType || '',
        qty: 0,
        fromLocationId: null,
        toLocationId: updates.currentLocationId || unit.currentLocationId || null,
        statusBefore: unit.status,
        statusAfter: unit.status,
        refModel: 'barcodeDetailEdit',
        refNo: unit.barcodeNo || unit.barcodeGenerated || '',
        reason: 'Barcode details corrected from Barcode Report',
        notes: [
          updates.businessId !== undefined
            ? `Company changed from ${currentCompanyId || 'unassigned'} to ${updates.businessId}`
            : '',
          updates.stockDate !== undefined
            ? `GRC Date changed from ${unit.stockDate ? new Date(unit.stockDate).toISOString() : 'unrecorded'} to ${new Date(updates.stockDate).toISOString()}`
            : '',
          updates.stockAge !== undefined
            ? `Age changed from ${unit.stockAge ?? 'derived'} to ${updates.stockAge ?? 'derived'}`
            : '',
          updates.serialNo !== undefined
            ? `Serial Number changed from ${unit.serialNo || 'blank'} to ${updates.serialNo || 'blank'}`
            : '',
        ].filter(Boolean).join('; ') + '.',
        userId,
        userName: session.name || '',
        userEmail: session.email || '',
        at: new Date(),
      }], options);
    }

    // Create stock movement if quantity changed
    if (updates.qtyNum !== undefined) {
      const oldQuantity = Number(unit.qtyNum ?? unit.qty ?? 0);
      const newQuantity = updates.qtyNum;
      const delta = newQuantity - oldQuantity;
      
      if (delta !== 0) {
        const locationId = updates.currentLocationId || unit.currentLocationId || unit.locationId || null;
        const businessId = updates.currentBusinessId || updates.businessId
          || unit.currentBusinessId || unit.businessId || '';
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

    return {
      ok: true,
      updated: updates,
      /* what the screen shows once the save is done - the company and location
         it chose, plus the three fields it can now edit */
      saved: {
        companyId,
        companyName: str(savedCompany?.name),
        currentLocationId,
        locationName: str(locationById.get(currentLocationId)?.name),
        grcDate: updates.stockDate || null,
        stockAge: updates.stockAge !== undefined ? updates.stockAge : null,
        serialNo: updates.serialNo !== undefined ? updates.serialNo : '',
      },
    };
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
      ? Supplier.findById(unit.supplierId).select(
        'businessId businessName firstName lastName contactId gstNo billingMobile billingEmail billingAddressLine1 billingAddressLine2 billingCity billingState billingZipCode'
      ).lean() : null,
  ]);

  /* THE COMPANY (user, 27-10-2026). companyId when a save from this screen
     wrote one, otherwise the business the unit was received in - so every
     barcode, old or new, answers with a company the picker can show. */
  const companyKey = String(unit.companyId || unit.currentBusinessId || unit.businessId || '');
  const company = companyKey && isValidObjectId(companyKey)
    ? await Business.findById(companyKey).select('name').lean()
    : null;

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
  }).sort({ createdAt: 1, _id: 1 }).lean();

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
  const supplierReadDenied = supplier
    ? await screenDenial({
      session,
      screen: SCREENS.SUPPLIER,
      label: 'suppliers',
      action: PERM.READ,
      businessId: supplier.businessId,
    })
    : null;
  const mayReadSupplierDetails = !supplierReadDenied;

  /* THE BARCODE IMAGE - this barcode's own (barcodeLabel.imageUrl), as saved
     here or by the mobile app; nothing borrowed from the Item master. The
     item's picture, when it has one, is its own field beside it. */
  const barcodeImageUrl = imageUrl(
    unit.imageUrl || unit.filePath || '',
    unit.barcodeNo || unit.barcodeGenerated,
    unit.oldBarcode
  );
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

      supplierId: str(unit.supplierId),
      supplierDisplayName: supplier
        ? str(supplier.businessName) || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')
        : '',
      supplierCode: mayReadSupplierDetails ? str(supplier?.contactId) : '',
      supplierGstin: mayReadSupplierDetails ? str(supplier?.gstNo) : '',
      supplierContact: mayReadSupplierDetails ? str(supplier?.billingMobile) : '',
      supplierEmail: mayReadSupplierDetails ? str(supplier?.billingEmail) : '',
      supplierAddress: mayReadSupplierDetails ? [
        supplier?.billingAddressLine1,
        supplier?.billingAddressLine2,
        supplier?.billingCity,
        supplier?.billingState,
        supplier?.billingZipCode,
      ].map(str).filter(Boolean).join(', ') : '',
      supplierName,
      /* the pair the screen calls Company and Location: the company this unit
         belongs to, and the location it sits at inside that company */
      companyId: companyKey,
      companyName: str(company?.name),
      locationId: String(unit.currentLocationId || unit.locationId || ''),
      currentLocationId: String(unit.currentLocationId || unit.locationId || ''),
      originLocationId: String(unit.locationId || ''),
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
