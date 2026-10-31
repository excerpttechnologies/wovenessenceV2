import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreDebitNote, { MODULE } from '@/models/StoreDebitNote';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import { nextSeriesNumber } from '@/lib/docnumber';
import { applyStoreTotals, GST_MODE, r2 } from '@/lib/storeSell';
import { listStoreDocs } from '@/lib/storeDocList';

/* /api/is-debit-note - Received Debit Notes for Inter Store Sell.

   A FINANCIAL ADJUSTMENT ONLY. Creating one does not move stock and does not
   create a barcode row - the goods never changed hands. Anything physical is
   a Sales Return, which has its own stock movement.

   The note is raised by the BUYING store against the invoice it received:
   locationId is the invoice's buyer store, fromLocationId the store that
   issued the invoice.

   The cap is per invoice line: quantity - already debited - already returned.
   A line therefore cannot be both returned and debited for the same unit. */

const SCREEN = { screen: SCREENS.IS_DEBIT_NOTE, label: 'inter store received debit notes' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req) {
  return listStoreDocs(req, {
    Model: StoreDebitNote,
    ...SCREEN,
    dateField: 'debitNoteDate',
    searchFields: ['debitNoteNo', 'salesInvoiceNo', 'reason'],
    sortKeys: ['debitNoteNo', 'debitNoteDate', 'totalQty', 'netValue'],
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
  if (!isValidObjectId(body.location)) return json({ error: 'Select the store raising this note in the top bar.' }, 422);
  if (!isValidObjectId(data.salesInvoiceId)) return json({ error: 'Select the Sales Invoice being adjusted.' }, 422);
  if (!data.debitNoteDate) return json({ error: 'Debit Note Date is required.' }, 422);

  /* The BUYING store raises this note, so the invoice must be one ADDRESSED
     TO this store - not merely one in this business. Without the
     toLocationId condition any store could adjust any invoice. */
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
  if (!requested.size) return json({ error: 'Enter a quantity on at least one line.' }, 422);

  const mode = invoice.gstMode || GST_MODE.CGST_SGST;
  const lines = [];
  const claims = [];

  for (const item of (invoice.items || [])) {
    const ask = requested.get(String(item.lineId));
    if (!ask) continue;

    const available = r2(
      (Number(item.qty) || 0) - r2(item.debitedQty) - r2(item.returnedQty)
    );

    if (ask > available) {
      return json(
        {
          error: 'Barcode ' + (item.barcodeNo || '') + ' can only be adjusted for '
            + available + ' more (already debited or returned).',
        },
        422
      );
    }

    lines.push({ ...item, qty: ask, stockMoves: undefined });
    claims.push({ lineId: String(item.lineId), qty: ask, before: r2(item.debitedQty) });
  }

  if (!lines.length) return json({ error: 'Those lines are not on the selected invoice.' }, 422);

  const totals = applyStoreTotals(lines, { mode });

  const note = {
    module: MODULE,
    businessId: body.business,
    /* the buying store receives the adjustment */
    locationId: invoice.toLocationId,
    fromLocationId: invoice.locationId,
    finYear: body.finYear || invoice.finYear || '',
    debitNoteDate: new Date(data.debitNoteDate),
    salesInvoiceId: invoice._id,
    salesInvoiceNo: invoice.invoiceNo || '',
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

  note.debitNoteNo = await nextSeriesNumber(StoreDebitNote, 'debitNoteNo', 'ISDN/', {
    scope: { businessId: body.business, locationId: invoice.toLocationId, finYear: note.finYear },
    pad: 4,
  });

  const created = await StoreDebitNote.create(note);

  /* claim the adjusted quantity on the invoice, compare-and-set style */
  /* only the claims actually applied may be released on failure */
  const applied = [];

  try {
    for (const claim of claims) {
      const res = await StoreSalesInvoice.collection.updateOne(
        {
          _id: new Types.ObjectId(String(invoice._id)),
          items: { $elemMatch: { lineId: claim.lineId, debitedQty: claim.before } },
        },
        { $inc: { 'items.$[l].debitedQty': claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
      if (!res.modifiedCount) {
        throw new Error('The invoice changed while this note was being saved. Reload and retry.');
      }
      applied.push(claim);
    }
  } catch (err) {
    await StoreDebitNote.findByIdAndDelete(created._id);
    for (const claim of applied) {
      await StoreSalesInvoice.collection.updateOne(
        { _id: new Types.ObjectId(String(invoice._id)) },
        { $inc: { 'items.$[l].debitedQty': -claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
    }
    return json({ error: err.message || 'Could not save the debit note.' }, 409);
  }

  return json({ ok: true, id: String(created._id), debitNoteNo: created.debitNoteNo });
}
