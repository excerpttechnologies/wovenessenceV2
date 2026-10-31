import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreSalesInvoice, { MODULE } from '@/models/StoreSalesInvoice';
import StoreDeliveryChallan, { DC_STATUS } from '@/models/StoreDeliveryChallan';
import CompanyLocation from '@/models/CompanyLocation';
import { nextSeriesNumber } from '@/lib/docnumber';
import { applyStoreTotals, GST_MODE, r2 } from '@/lib/storeSell';
import { listStoreDocs } from '@/lib/storeDocList';

/* /api/is-sales-invoice - list + raise.

   RAISED FROM THE CHALLAN'S SAVED LINES. The request names challans (and,
   optionally, particular lines with a quantity for a partial bill); it never
   posts item details. The lines are copied out of the stored documents, so an
   invoice cannot describe goods the challan did not carry.

   DUPLICATE BILLING. Every challan line carries `billedQty`. The copy is
   capped by what is left, and the increment is a compare-and-set on the value
   this request read - if somebody else billed the same unit in between, the
   update matches nothing, the invoice is removed again and the request is
   refused. That is the same guarded-claim pattern the Inter Company invoice
   uses, and it is what makes a double-click safe.

   GST is recomputed here from the line quantity and rate. The percentage on
   the line came from the HSN master when the challan was raised; a line that
   somehow has no percentage is resolved again. */

const SCREEN = { screen: SCREENS.IS_SALES_INVOICE, label: 'inter store sales invoices' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req) {
  return listStoreDocs(req, {
    Model: StoreSalesInvoice,
    ...SCREEN,
    dateField: 'invoiceDate',
    searchFields: ['invoiceNo', 'toLocationName', 'remarks'],
    sortKeys: ['invoiceNo', 'invoiceDate', 'totalQty', 'netValue', 'status'],
    refs: ['locationId', 'toLocationId'],
    idFields: ['businessId', 'locationId', 'toLocationId'],
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
  const challanIds = (Array.isArray(data.deliveryChallanIds) ? data.deliveryChallanIds : []).filter(isValidObjectId);

  if (!isValidObjectId(body.business)) return json({ error: 'Select a business in the top bar first.' }, 422);
  if (!isValidObjectId(body.location)) return json({ error: 'Select the selling store.' }, 422);
  if (!challanIds.length) return json({ error: 'Select at least one Delivery Challan to invoice.' }, 422);
  if (!data.invoiceDate) return json({ error: 'Invoice Date is required.' }, 422);

  const challans = await StoreDeliveryChallan.find({
    _id: { $in: challanIds },
    module: 'interStoreSell',
    businessId: body.business,
    locationId: body.location,
  }).lean();

  if (challans.length !== challanIds.length) {
    return json({ error: 'One of the selected challans was not found for this store.' }, 422);
  }

  const notReceived = challans.find((c) => !c.receivedAt);
  if (notReceived) {
    return json(
      { error: 'Challan ' + (notReceived.dcNo || '') + ' has not been received by the destination store yet.' },
      422
    );
  }

  /* an optional [ { challanId, lineId, qty } ] allows a partial bill; without
     it every unbilled quantity is billed */
  const wanted = new Map();
  (Array.isArray(data.lines) ? data.lines : []).forEach((l) => {
    if (l && l.lineId && Number(l.qty) > 0) {
      wanted.set(String(l.challanId) + '|' + String(l.lineId), r2(l.qty));
    }
  });

  const mode = challans[0].gstMode || GST_MODE.CGST_SGST;
  const lines = [];
  const claims = [];

  for (const challan of challans) {
    for (const item of (challan.items || [])) {
      const already = r2(item.billedQty);
      const remaining = r2((Number(item.qty) || 0) - already);
      if (remaining <= 0) continue;

      const key = String(challan._id) + '|' + String(item.lineId);
      const ask = wanted.size ? wanted.get(key) : remaining;
      if (!ask) continue;

      if (ask > remaining) {
        return json(
          {
            error: 'Challan ' + (challan.dcNo || '') + ' line ' + (item.barcodeNo || '')
              + ' can only be billed for ' + remaining + ' more.',
          },
          422
        );
      }

      lines.push({
        ...item,
        lineId: String(item.lineId),
        challanLineId: String(item.lineId),
        challanId: String(challan._id),
        dcNo: challan.dcNo || '',
        qty: ask,
        billedQty: 0,
        returnedQty: 0,
        debitedQty: 0,
        stockMoves: undefined,
      });

      claims.push({ challanId: String(challan._id), lineId: String(item.lineId), qty: ask, before: already });
    }
  }

  if (!lines.length) {
    return json({ error: 'Nothing left to bill on the selected challans.' }, 422);
  }

  const destination = await CompanyLocation.findById(challans[0].toLocationId).lean();

  const totals = applyStoreTotals(lines, { mode });

  const invoice = {
    module: MODULE,
    businessId: body.business,
    locationId: body.location,
    finYear: body.finYear || '',
    toLocationId: challans[0].toLocationId,
    toLocationName: challans[0].toLocationName || destination?.name || '',
    customerGstn: challans[0].customerGstn || destination?.gstin || '',
    customerAddress: challans[0].customerAddress || '',
    invoiceDate: new Date(data.invoiceDate),
    deliveryChallanIds: challans.map((c) => c._id),
    deliveryChallanNos: challans.map((c) => c.dcNo).filter(Boolean),
    gstMode: mode,
    taxableValue: totals.taxableValue,
    igstTotal: totals.igstTotal,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    roundOff: totals.roundOff,
    totalQty: totals.totalQty,
    netValue: totals.netValue,
    remarks: String(data.remarks || ''),
    status: 'confirmed',
    items: totals.items,
    createdBy: session.name || session.email || '',
  };

  invoice.invoiceNo = await nextSeriesNumber(StoreSalesInvoice, 'invoiceNo', 'ISSI/', {
    scope: { businessId: body.business, locationId: body.location, finYear: body.finYear || '' },
    pad: 4,
  });

  const created = await StoreSalesInvoice.create(invoice);

  /* Claim each challan line. A compare-and-set on the billedQty we read: if it
     moved, this invoice was built on stale numbers and must not stand. */
  /* `applied` - not `claims` - is what a rollback may touch. Releasing the
     whole list would decrement lines this request never incremented, and a
     negative billedQty would then let the same unit be billed twice. */
  const applied = [];

  try {
    for (const claim of claims) {
      const res = await StoreDeliveryChallan.collection.updateOne(
        {
          _id: new Types.ObjectId(claim.challanId),
          items: { $elemMatch: { lineId: claim.lineId, billedQty: claim.before } },
        },
        {
          $inc: { 'items.$[l].billedQty': claim.qty },
          $set: { salesInvoiceId: created._id },
        },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );

      if (!res.modifiedCount) {
        throw new Error(
          'Challan line ' + claim.lineId + ' was billed by another request. Nothing was saved - reload and retry.'
        );
      }
      applied.push(claim);
    }

    /* Invoiced only when nothing on the challan is left unbilled - a partial
       bill keeps it on the Received list, where it can be invoiced again. */
    for (const challan of challans) {
      const fresh = await StoreDeliveryChallan.findById(challan._id).lean();
      if (!fresh) continue;
      const fullyBilled = (fresh.items || []).every(
        (l) => r2((Number(l.qty) || 0) - r2(l.billedQty)) <= 0
      );
      await StoreDeliveryChallan.collection.updateOne(
        { _id: challan._id },
        { $set: { status: fullyBilled ? DC_STATUS.INVOICED : DC_STATUS.RECEIVED } }
      );
    }
  } catch (err) {
    await StoreSalesInvoice.findByIdAndDelete(created._id);
    /* release only the lines this request managed to claim before it failed */
    for (const claim of applied) {
      await StoreDeliveryChallan.collection.updateOne(
        { _id: new Types.ObjectId(claim.challanId) },
        { $inc: { 'items.$[l].billedQty': -claim.qty } },
        { arrayFilters: [{ 'l.lineId': claim.lineId }] }
      );
    }
    return json({ error: err.message || 'Could not raise the invoice.' }, 409);
  }

  return json({ ok: true, id: String(created._id), invoiceNo: created.invoiceNo });
}
