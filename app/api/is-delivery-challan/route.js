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
import { shipStoreStock, StoreStockError } from '@/lib/storeStock';
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
    idFields: ['businessId', 'locationId', 'toLocationId'],
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
  if (destination.businessId && String(destination.businessId) !== String(body.business)) {
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
      ],
    }).lean();

    const hsn = String(raw.hsn || row?.hsn || row?.hsnCode || '').trim();
    const unitRate = Number(raw.unitRate) || 0;
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
      /* running adjustments, read by the invoice, debit note and return */
      billedQty: 0,
      returnedQty: 0,
      debitedQty: 0,
      stockMoves: [],
    });
  }

  if (Object.keys(errors).length) return json({ errors }, 422);

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
