import { isValidObjectId } from 'mongoose';
import { randomUUID } from 'crypto';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreDeliveryChallan, { DC_STATUS, MODULE } from '@/models/StoreDeliveryChallan';
import CompanyLocation from '@/models/CompanyLocation';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { nextSeriesNumber } from '@/lib/docnumber';
import { resolveGstRate, gstModeForLocations } from '@/lib/storeGst';
import { applyStoreTotals, GST_MODE } from '@/lib/storeSell';
import { shipStoreStock, assertStoreStockAvailable, StoreStockError } from '@/lib/storeStock';
import { isDestinationStore, businessOfLocation } from '@/lib/storeLocations';
import { listStoreDocs } from '@/lib/storeDocList';

/* /api/is-delivery-challan - list + create for Inter Store Sell.

   SENDING SIDE ONLY. Raising one takes the goods out of the source store
   (lib/storeStock.js shipStoreStock). The destination store accepts them on
   .../[id]/receive, which creates its own barcode rows - despatching is not
   receiving, exactly as on the Inter Company side.

   STOCK IS NEVER TRUSTED FROM THE BROWSER, and neither is GST: every line's
   rate is looked up from the HSN > Tax master (lib/storeGst.js) and every
   money figure is recomputed here from quantity, rate and that looked-up
   percentage. */

const SCREEN = { screen: SCREENS.IS_DELIVERY_CHALLAN, label: 'inter store delivery challans' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req) {
  return listStoreDocs(req, {
    Model: StoreDeliveryChallan,
    ...SCREEN,
    dateField: 'dcDate',
    searchFields: ['dcNo', 'toLocationName', 'remarks'],
    sortKeys: ['dcNo', 'dcDate', 'totalQty', 'netValue', 'status', 'receivedAt'],
    refs: ['locationId', 'toLocationId', 'stockPointId'],
    /* raised BY the source store, addressed TO the destination store - the
       list shows it to whichever of the two the top bar is on */
    fromField: 'locationId',
    toField: 'toLocationId',
  });
}

const addressOf = (loc) => [
  loc?.addressLine1, loc?.addressLine2, loc?.city, loc?.state, loc?.zipCode,
].filter(Boolean).join(', ');

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.CREATE, businessId: body.business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const data = body.data || {};
  const errors = {};

  if (!isValidObjectId(body.business)) return json({ error: 'Select a business in the top bar first.' }, 422);
  if (!isValidObjectId(body.location)) return json({ error: 'Select the source store.' }, 422);
  if (!isValidObjectId(data.toLocationId)) errors.toLocationId = 'Destination Store is required';
  if (!data.dcDate) errors.dcDate = 'DC Date is required';
  if (isValidObjectId(data.toLocationId) && String(data.toLocationId) === String(body.location)) {
    errors.toLocationId = 'The destination store must be different from the source store';
  }

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) errors.items = 'Add at least one barcode item';

  if (Object.keys(errors).length) return json({ errors }, 422);

  const [source, destination] = await Promise.all([
    CompanyLocation.findById(body.location).lean(),
    CompanyLocation.findById(data.toLocationId).lean(),
  ]);

  if (!source) return json({ error: 'The source store was not found.' }, 422);
  if (!destination) return json({ error: 'The destination store was not found.' }, 422);

  /* The source store must be a store of the business named in the top bar.
     Nothing used to check this, so a document could be filed under one branch
     while naming another branch's shop - its businessId/locationId pair then
     disagreed, and every report grouping by business was off for it. */
  const sourceBranch = await businessOfLocation(body.location);
  if (sourceBranch && String(sourceBranch) !== String(body.business)) {
    return json(
      { error: 'That store belongs to another business - select the business that owns it in the top bar.' },
      422
    );
  }

  /* Same rule the picker offers: a store of this company - the branch itself,
     a sibling branch, or a master row whose branch was deleted. A store of an
     unrelated company is refused here as well, because this check is what an
     honest dropdown cannot be relied on to enforce. */
  if (!(await isDestinationStore(body.business, data.toLocationId))) {
    return json({ error: 'The destination store belongs to another business.' }, 422);
  }

  /* intra-state (CGST + SGST) unless the two stores record different states */
  let mode = gstModeForLocations(source, destination);

  const built = [];

  for (const [i, raw] of items.entries()) {
    const barcodeNo = String(raw.barcodeNo || '').trim();
    const qty = Math.round((Number(raw.qty) || 0) * 100) / 100;

    if (!barcodeNo) { errors['items.' + i] = 'Barcode is required on every line'; continue; }
    if (!(qty > 0)) { errors['items.' + i] = 'Quantity must be greater than zero'; continue; }

    const row = await BarcodeLabel.findOne({
      $and: [
        { $or: [{ barcodeNo }, { barcodeGenerated: barcodeNo }] },
        { status: BARCODE_STATUS.IN_STOCK },
        {
          $or: [
            { businessId: String(body.business) },
            { businessId: '' },
            { businessId: { $exists: false } },
          ],
        },
        /* The SOURCE store's row. One barcode can exist at several stores with
           different item details and rates, and the line must describe the row
           being shipped - the same scope the barcode lookup and the despatch
           already use. */
        {
          $or: [
            { locationId: String(body.location) },
            { locationId: '' },
            { locationId: { $exists: false } },
          ],
        },
      ],
    }).lean();

    const hsn = String(raw.hsn || row?.hsn || row?.hsnCode || '').trim();
    const unitRate = Number(raw.unitRate) || 0;

    /* A despatch at zero value produces a document - and an invoice - worth
       nothing, which is what the Inter Store challans raised before the
       barcode lookup read the right price field were. The browser is not
       trusted to have filled it, so an unset/negative rate is refused here. */
    if (!(unitRate > 0)) {
      errors['items.' + i] = 'Barcode ' + barcodeNo
        + ' has no sale price - set its RSP / WSP or type a rate on the line.';
      continue;
    }
    const resolved = await resolveGstRate({
      businessId: body.business,
      hsnCode: hsn,
      amount: unitRate * qty,
    });

    if (!mode) mode = resolved.mode || GST_MODE.CGST_SGST;

    built.push({
      lineId: randomUUID(),
      barcodeNo,
      barcodeId: row ? String(row._id) : '',
      itemCode: raw.itemCode || row?.itemCode || '',
      itemName: raw.itemName || row?.printDescription || row?.supplierDescription || '',
      hsn,
      uom: raw.uom || row?.uom || row?.uomType || '',
      qty,
      unitRate,
      discountPct: Number(raw.discountPct) || 0,
      roffDiscount: Number(raw.roffDiscount) || 0,
      /* looked up, never taken from the request */
      gstPct: resolved.gstPct,
      /* line narration and the item photo, as entered / looked up */
      remarks: String(raw.remarks || '').trim(),
      image: String(raw.image || row?.imageUrl || ''),
      /* running adjustments, read by the invoice, debit note and return */
      billedQty: 0,
      returnedQty: 0,
      debitedQty: 0,
      stockMoves: [],
    });
  }

  if (Object.keys(errors).length) return json({ errors }, 422);

  /* Refuse a short line BEFORE the document is created. The challan number is
     reserved atomically at save, so a document that could not be shipped used
     to burn one and leave a gap in the store's series. The guarded write in
     shipStoreStock below is still what actually protects the stock. */
  try {
    await assertStoreStockAvailable({
      businessId: body.business,
      locationId: body.location,
      lines: built,
    });
  } catch (err) {
    if (err instanceof StoreStockError) return json({ error: err.message }, err.status);
    throw err;
  }

  const totals = applyStoreTotals(built, {
    discountPercent: data.discountPercent,
    roundOffDiscountAmt: data.roundOffDiscountAmt,
    mode,
  });

  const doc = {
    module: MODULE,
    businessId: body.business,
    locationId: body.location,
    finYear: body.finYear || '',
    toLocationId: data.toLocationId,
    toLocationName: destination.name || '',
    customerGstn: destination.gstin || '',
    customerAddress: addressOf(destination),
    dcDate: new Date(data.dcDate),
    stockPointId: isValidObjectId(data.stockPointId) ? data.stockPointId : null,
    remarks: String(data.remarks || ''),
    gstMode: mode || GST_MODE.CGST_SGST,
    discountPercent: Number(data.discountPercent) || 0,
    roundOffDiscountAmt: Number(data.roundOffDiscountAmt) || 0,
    totalQty: totals.totalQty,
    taxableValue: totals.taxableValue,
    igstTotal: totals.igstTotal,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    roundOff: totals.roundOff,
    netValue: totals.netValue,
    items: totals.items,
    status: DC_STATUS.DISPATCHED,
    dispatchedAt: new Date(),
    createdBy: session.name || session.email || '',
  };

  /* ISDC/0001 - atomic, one series per store per financial year */
  doc.dcNo = await nextSeriesNumber(StoreDeliveryChallan, 'dcNo', 'ISDC/', {
    scope: { businessId: body.business, locationId: body.location, finYear: body.finYear || '' },
    pad: 4,
  });

  const created = await StoreDeliveryChallan.create(doc);

  /* Take the goods out of the source store. If the movement fails - a line
     asking for more than the store holds, or another request taking it first -
     the document is removed again rather than left standing for stock that
     never left. */
  try {
    const shipped = await shipStoreStock({
      challan: created,
      lines: created.items,
      user: session,
    });
    await StoreDeliveryChallan.collection.updateOne(
      { _id: created._id },
      { $set: { items: shipped } }
    );
  } catch (err) {
    await StoreDeliveryChallan.deleteOne({ _id: created._id });
    if (err instanceof StoreStockError) return json({ error: err.message }, err.status);
    throw err;
  }

  return json({ ok: true, id: String(created._id), dcNo: created.dcNo });
}
