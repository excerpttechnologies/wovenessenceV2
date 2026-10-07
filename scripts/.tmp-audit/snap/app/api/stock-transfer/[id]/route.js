import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer, { TRANSFER_STATUS } from '@/models/StockTransfer';
import StockMovement from '@/models/StockMovement';
import Contact from '@/models/Contact';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS, canUseLocation } from '@/lib/rbac';
import { AuthzError } from '@/lib/rbac';
import { withLocationPairLock } from '@/lib/locks';
import { withTransaction, loadUnits, applyMovement, BARCODE_STATUS, MOVEMENT_TYPES } from '@/lib/inventory';

/* /api/stock-transfer/<id> - one transfer, with its lines and its trail.

   Also what scanning the document-number barcode resolves to: the screen
   sends the scanned number to /api/stock-transfer?search=<no>, gets the id,
   and opens this. */

export const GET = handler(async (req, { params }) => {
  const session = await requirePermission(null);
  const { id } = await params;
  await dbConnect();

  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id).lean();
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  /* A restricted user may open a transfer only if one of its ends is theirs.
     Checked here rather than only in the list, because the id is guessable. */
  const mine = canUseLocation(session, doc.fromLocationId) || canUseLocation(session, doc.toLocationId);
  if (!mine) throw new AuthzError(403, 'This transfer does not involve your location.', 'WRONG_LOCATION');

  /* the movement ledger for this document - the audit trail panel */
  const history = await StockMovement.find({ refId: doc._id })
    .sort({ at: 1, createdAt: 1 })
    .lean();

  /* Supplier names for the detailed Delivery Challan. Resolved here rather
     than stored on every line, because a line only needs the id and the
     challan is the one place the name is printed. */
  const supplierIds = [...new Set(
    (doc.lines || []).map((l) => l.supplierId).filter((s) => s && isValidObjectId(String(s))).map(String)
  )];
  const suppliers = supplierIds.length
    ? await Contact.find({ _id: { $in: supplierIds } })
      .select('businessName firstName lastName contactId').lean()
    : [];
  const supplierNames = Object.fromEntries(suppliers.map((s) => [
    String(s._id),
    [s.businessName || [s.firstName, s.lastName].filter(Boolean).join(' '),
      s.contactId ? '[' + s.contactId + ']' : ''].filter(Boolean).join(' ').trim(),
  ]));

  return json({
    doc: { ...doc, _id: String(doc._id) },
    supplierNames,
    history: history.map((h) => ({
      _id: String(h._id),
      type: h.type, barcodeNo: h.barcodeNo, qty: h.qty, at: h.at,
      statusBefore: h.statusBefore, statusAfter: h.statusAfter,
      reason: h.reason, notes: h.notes,
      user: h.userName || h.userEmail || '',
    })),
    /* what the viewer is allowed to do, so the screen shows only live buttons */
    can: {
      receive: canUseLocation(session, doc.toLocationId),
      returnItems: canUseLocation(session, doc.toLocationId),
      acceptReturn: canUseLocation(session, doc.fromLocationId),
      bill: canUseLocation(session, doc.fromLocationId),
    },
  });
});

/* DELETE - cancel a transfer that has not been received anywhere yet.

   Cancelling puts every despatched unit back into the source's stock and
   writes the reversal to the ledger; it never simply deletes the document,
   because the despatch itself is a fact that happened. */
export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  await dbConnect();
  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id);
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  const session = await requirePermission(PERMISSIONS.TRANSFER_DESPATCH, { locationId: doc.fromLocationId });

  if (doc.status !== TRANSFER_STATUS.IN_TRANSIT) {
    return json({
      error: 'Only a transfer that is still fully in transit can be cancelled. This one is ' + doc.status + '.',
      code: 'BAD_STATE',
    }, 409);
  }
  if ((doc.lines || []).some((l) => l.received || l.returned)) {
    return json({
      error: 'Part of this transfer has already been handled at the destination, so it cannot be cancelled.',
      code: 'BAD_STATE',
    }, 409);
  }

  await withLocationPairLock(
    {
      businessId: doc.businessId, fromLocationId: doc.fromLocationId, toLocationId: doc.toLocationId,
      operation: 'stock-transfer:cancel', refNo: doc.transferNo, user: session,
    },
    async () => withTransaction(async (dbSession) => {
      const units = await loadUnits(
        (doc.lines || []).map((l) => l.barcodeNo),
        { businessId: doc.businessId, session: dbSession, prefer: BARCODE_STATUS.IN_TRANSIT }
      );

      await applyMovement({
        units,
        expect: BARCODE_STATUS.IN_TRANSIT,
        set: {
          status: BARCODE_STATUS.IN_STOCK,
          currentLocationId: doc.fromLocationId,
          transferId: null,
          transferNo: '',
        },
        movement: {
          type: MOVEMENT_TYPES.TRANSFER_RETURN_IN,
          direction: 'in',
          fromLocationId: doc.toLocationId,
          toLocationId: doc.fromLocationId,
          refModel: 'stockTransfer',
          refId: doc._id,
          refNo: doc.transferNo,
          reason: 'Transfer cancelled before receipt',
          at: new Date(),
        },
        user: session, session: dbSession,
      });

      doc.status = TRANSFER_STATUS.CANCELLED;
      doc.remarks = [doc.remarks, 'Cancelled by ' + (session.name || session.email || '')]
        .filter(Boolean).join(' | ');
      await doc.save(dbSession ? { session: dbSession } : {});
    })
  );

  return json({ ok: true, status: TRANSFER_STATUS.CANCELLED });
});
