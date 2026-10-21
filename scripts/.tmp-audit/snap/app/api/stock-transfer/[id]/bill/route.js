import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer, { TRANSFER_STATUS } from '@/models/StockTransfer';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { nextSeriesNumber } from '@/lib/docnumber';
import { withTransaction } from '@/lib/inventory';

/* GET  /api/stock-transfer/<id>/bill  - what would be billed, and why
   POST /api/stock-transfer/<id>/bill  - raise it

   THE BILLING RULE, applied here and nowhere else:

       billable = despatched - returned

   The operator is never asked to work this out, and cannot override it. The
   quantity comes from the transfer's own lines, which are barcodes, so the
   figure is not a total somebody typed - it is a count of physical units that
   did not come back.

   A GET first is deliberate: the source location can see the split (sent /
   received / still in transit / returned) and what it adds up to before
   committing to an invoice number. */

export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await dbConnect();
  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id).lean();
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  await requirePermission(PERMISSIONS.BILLING_MANAGE, { locationId: doc.fromLocationId });

  return json({ ok: true, ...billPreview(doc) });
});

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await dbConnect();
  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id);
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  const session = await requirePermission(PERMISSIONS.BILLING_MANAGE, { locationId: doc.fromLocationId });

  if (doc.billingId || doc.billingNo) {
    return json({
      error: 'This transfer has already been billed on ' + doc.billingNo + '.',
      code: 'ALREADY_BILLED',
    }, 409);
  }
  if (doc.status === TRANSFER_STATUS.CANCELLED || doc.status === TRANSFER_STATUS.DRAFT) {
    return json({ error: 'A ' + doc.status.toLowerCase() + ' transfer cannot be billed.', code: 'BAD_STATE' }, 409);
  }

  /* Returns that the source has not taken back yet are still moving. Billing
     now would fix a quantity that a pending return is about to change, so it
     is refused with the reason rather than quietly billing the higher figure.
     `force` lets an administrator bill anyway when the goods are known to be
     lost in transit - a real situation, but a decision, not a default. */
  const pendingReturns = (doc.lines || []).filter((l) => l.returned && !l.returnAccepted).length;
  if (pendingReturns && !body?.force) {
    return json({
      error: pendingReturns + ' returned item(s) have not been taken back at the source yet. '
        + 'Accept the return first, or bill with force:true to fix the quantity as it stands.',
      code: 'RETURNS_PENDING',
      pendingReturns,
    }, 409);
  }

  if (!doc.billableCount) {
    return json({
      error: 'Everything on this transfer came back, so there is nothing to bill.',
      code: 'NOTHING_BILLABLE',
    }, 409);
  }

  const updated = await withTransaction(async (dbSession) => {
    const fresh = await StockTransfer.findById(id).session(dbSession || null);
    if (fresh.billingNo) {
      return fresh;                     // another request billed it first; idempotent
    }

    const yy = String(fresh.finYear || '').slice(2, 4) || String(new Date().getFullYear()).slice(2);
    fresh.billingNo = await nextSeriesNumber(StockTransfer, 'billingNo', 'STB/' + yy + '/', {
      scope: { businessId: fresh.businessId, finYear: fresh.finYear },
      pad: 4,
    });
    fresh.billingId = fresh._id;        // the transfer is its own billing document
    fresh.billedAt = new Date();

    fresh.recalc();
    fresh.deriveStatus();
    /* billing is the last step - once raised against a settled transfer the
       document is done */
    if (fresh.pendingCount === 0) fresh.status = TRANSFER_STATUS.COMPLETED;

    await fresh.save(dbSession ? { session: dbSession } : {});
    void session;
    return fresh;
  });

  return json({ ok: true, ...billPreview(updated.toObject ? updated.toObject() : updated) }, 201);
});

/* ------------------------------------------------------------- internals -- */

/* The invoice's own view of the transfer: only the lines that are being paid
   for, each carrying its RSP as well as its cost. */
function billPreview(doc) {
  const lines = (doc.lines || []).filter((l) => !l.returned);
  const returned = (doc.lines || []).filter((l) => l.returned);

  return {
    transferNo: doc.transferNo,
    /* the value scanning the document barcode resolves to */
    documentBarcode: doc.transferNo,
    billingNo: doc.billingNo || '',
    billedAt: doc.billedAt || null,
    status: doc.status,

    from: { id: String(doc.fromLocationId || ''), name: doc.fromLocationName, gstn: doc.fromGstn, address: doc.fromAddress },
    to: { id: String(doc.toLocationId || ''), name: doc.toLocationName, gstn: doc.toGstn, address: doc.toAddress },

    /* the working, shown on the document so the figure is self-explaining */
    quantities: {
      sent: doc.sentQty, sentCount: doc.sentCount,
      received: doc.receivedQty, receivedCount: doc.receivedCount,
      returned: doc.returnedQty, returnedCount: doc.returnedCount,
      pending: doc.pendingQty, pendingCount: doc.pendingCount,
      billable: doc.billableQty, billableCount: doc.billableCount,
      totalPc: doc.totalPc, totalMtr: doc.totalMtr,
    },

    lines: lines.map((l) => ({
      barcodeNo: l.barcodeNo,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description,
      hsn: l.hsn,
      uom: l.uom,
      uomType: l.uomType,
      batchType: l.batchType,
      qty: l.qty,
      rate: l.rate,
      /* RSP on the billing document - the requirement's addition */
      rsp: l.rsp,
      gst: l.gst,
      taxable: round2(l.rate * l.qty),
      gstAmount: round2(l.rate * l.qty * (l.gst / 100)),
      amount: round2(l.rate * l.qty * (1 + l.gst / 100)),
      received: l.received,
      supplierId: l.supplierId,
      grcNo: l.grcNo,
    })),

    /* shown as a deduction, so the customer sees why the bill is not the
       despatched quantity */
    excluded: returned.map((l) => ({
      barcodeNo: l.barcodeNo,
      itemName: l.itemName,
      qty: l.qty,
      reason: l.returnReason,
      notes: l.returnNotes,
      acceptedBack: l.returnAccepted,
    })),

    totals: {
      taxable: round2(lines.reduce((a, l) => a + l.rate * l.qty, 0)),
      gst: round2(lines.reduce((a, l) => a + l.rate * l.qty * (l.gst / 100), 0)),
      net: doc.billableValue,
      rspValue: round2(lines.reduce((a, l) => a + (Number(l.rsp) || 0) * l.qty, 0)),
    },
  };
}

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
