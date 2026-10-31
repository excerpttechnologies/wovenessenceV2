import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreSalesReturn, { MODULE } from '@/models/StoreSalesReturn';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import { nextSeriesNumber } from '@/lib/docnumber';
import { applyStoreTotals, GST_MODE, r2 } from '@/lib/storeSell';
import { returnStoreStock, StoreStockError } from '@/lib/storeStock';
import { listStoreDocs } from '@/lib/storeDocList';

/* /api/is-sales-return - Inter Store Sell Sales Returns.

   THE ONE DOCUMENT IN THIS MODULE THAT MOVES STOCK AFTER THE CHALLAN. The
   buying store sends goods back; the quantity leaves its stock and goes back
   into the selling store's (lib/storeStock.js returnStoreStock), with a
   movement row for each side.

   Capping is per invoice line: quantity - already returned - already debited.
   The invoice's `returnedQty` is incremented with a compare-and-set BEFORE the
   stock moves, so two simultaneous returns of the same unit cannot both pass.
   If the movement then fails (the goods are no longer physically at the buying
   store, say), the increment is undone and the document removed - a return is
   never left saved for stock that did not move. */

const SCREEN = { screen: SCREENS.IS_SALES_RETURN, label: 'inter store sales returns' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req) {
  return listStoreDocs(req, {
    Model: StoreSalesReturn,
    ...SCREEN,
    dateField: 'returnDate',
    searchFields: ['returnNo', 'salesInvoiceNo', 'reason'],
    sortKeys: ['returnNo', 'returnDate', 'totalQty', 'netValue'],
    refs: ['locationId', 'fromLocationId'],
    idFields: ['businessId', 'locationId', 'fromLocationId'],
  });
}

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
  if (!isValidObjectId(body.business)) return json({ error: 'Select a business in the top bar first.' }, 422);
  if (!isValidObjectId(body.location)) return json({ error: 'Select the store returning the goods in the top bar.' }, 422);
  if (!isValidObjectId(data.salesInvoiceId)) return json({ error: 'Select the original Sales Invoice.' }, 422);
  if (!data.returnDate) return json({ error: 'Return Date is required.' }, 422);

  /* only the store the invoice was ADDRESSED TO can return its goods */
  const invoice = await StoreSalesInvoice.findOne({
    _id: data.salesInvoiceId,
    module: 'interStoreSell',
    businessId: body.business,
    toLocationId: body.location,
  }).lean();

  if (!invoice) return json({ error: 'That Sales Invoice was not addressed to this store.' }, 422);

  const requested = new Map();
  (Array.isArray(data.lines) ? data.lines : []).forEach((l) => {
    if (l && l.lineId && Number(l.qty) > 0) requested.set(String(l.lineId), r2(l.qty));
  });
  if (!requested.size) return json({ error: 'Enter a return quantity on at least one line.' }, 422);

  const mode = invoice.gstMode || GST_MODE.CGST_SGST;
  const lines = [];
  const claims = [];

  for (const item of (invoice.items || [])) {
    const ask = requested.get(String(item.lineId));
    if (!ask) continue;

    const available = r2(
      (Number(item.qty) || 0) - r2(item.returnedQty) - r2(item.debitedQty)
    );

    if (ask > available) {
      return json(
        {
          error: 'Barcode ' + (item.barcodeNo || '') + ' can only be returned for '
            + available + ' more (already returned or debited).',
        },
        422
      );
    }

    lines.push({ ...item, qty: ask, stockMoves: undefined });
    claims.push({ lineId: String(item.lineId), qty: ask, before: r2(item.returnedQty) });
  }

  if (!lines.length) return json({ error: 'Those lines are not on the selected invoice.' }, 422);

  const totals = applyStoreTotals(lines, { mode });

  const doc = {
    module: MODULE,
    businessId: body.business,
    /* the buying store is sending the goods back */
    locationId: invoice.toLocationId,
    fromLocationId: invoice.locationId,
    finYear: body.finYear || invoice.finYear || '',
    returnDate: new Date(data.returnDate),
    salesInvoiceId: invoice._id,
    salesInvoiceNo: invoice.invoiceNo || '',
    deliveryChallanIds: invoice.deliveryChallanIds || [],
    reason: String(data.reason || ''),
    gstMode: mode,
    taxableValue: totals.taxableValue,
    igstTotal: totals.igstTotal,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    roundOff: totals.roundOff,
    totalQty: totals.totalQty,
    netValue: totals.netValue,
    items: totals.items,
    status: 'confirmed',
    createdBy: session.name || session.email || '',
  };

  doc.returnNo = await nextSeriesNumber(StoreSalesReturn, 'returnNo', 'ISRT/', {
    scope: { businessId: body.business, locationId: invoice.toLocationId, finYear: doc.finYear },
    pad: 4,
  });

  const created = await StoreSalesReturn.create(doc);

  /* claim the quantity first, so a retry cannot pass the cap */
  const applied = [];

  try {
    for (const claim of claims) {
      const res = await StoreSalesInvoice.collection.updateOne(
        {
          _id: new Types.ObjectId(String(invoice._id)),
          items: { $elemMatch: { lineId: claim.lineId, returnedQty: claim.before } },
        },
        { $inc: { 'items.$[l].returnedQty': claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
      if (!res.modifiedCount) {
        throw new Error('The invoice changed while this return was being saved. Reload and retry.');
      }
      applied.push(claim);
    }
  } catch (err) {
    /* release only what was actually claimed - a failed second line must not
       roll back a first line that never changed */
    for (const claim of applied) {
      await StoreSalesInvoice.collection.updateOne(
        { _id: new Types.ObjectId(String(invoice._id)) },
        { $inc: { 'items.$[l].returnedQty': -claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
    }
    await StoreSalesReturn.findByIdAndDelete(created._id);
    return json({ error: err.message || 'Could not save the return.' }, 409);
  }

  /* then move the goods. A failure undoes the claim and the document. */
  try {
    await returnStoreStock({
      invoice,
      lines: lines.map((l) => ({ barcodeNo: l.barcodeNo, qty: l.qty })),
      user: session,
    });
  } catch (err) {
    for (const claim of applied) {
      await StoreSalesInvoice.collection.updateOne(
        { _id: new Types.ObjectId(String(invoice._id)) },
        { $inc: { 'items.$[l].returnedQty': -claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
    }
    await StoreSalesReturn.findByIdAndDelete(created._id);
    if (err instanceof StoreStockError) return json({ error: err.message }, err.status);
    throw err;
  }

  return json({ ok: true, id: String(created._id), returnNo: created.returnNo });
}
