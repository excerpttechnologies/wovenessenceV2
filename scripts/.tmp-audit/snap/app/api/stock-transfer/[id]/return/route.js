import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer, { TRANSFER_STATUS, RETURN_REASONS } from '@/models/StockTransfer';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { withLocationPairLock } from '@/lib/locks';
import { withTransaction, loadUnits, returnToSource, InventoryError } from '@/lib/inventory';

/* POST /api/stock-transfer/<id>/return
   { barcodes: [...], reason, notes }

   The destination sending stock back - damaged, wrong item, excess.

   A returned line is NOT a received line: the two flags are mutually
   exclusive on the document, so "transferred 10, received 8, returned 2"
   holds and billing (sent - returned) comes out at 8 without anybody
   working it out by hand.

   Both cases are allowed:
     - refused on arrival, never taken into stock (line still in transit)
     - found wrong later, after it was received
   because both happen. The engine picks the right starting status per unit. */

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id);
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  /* the DESTINATION raises the return */
  const session = await requirePermission(PERMISSIONS.TRANSFER_RETURN, { locationId: doc.toLocationId });

  if ([TRANSFER_STATUS.DRAFT, TRANSFER_STATUS.CANCELLED].includes(doc.status)) {
    return json({ error: 'This transfer is ' + doc.status.toLowerCase() + '; nothing can be returned against it.', code: 'BAD_STATE' }, 409);
  }

  const reason = String(body?.reason || '').trim();
  if (!reason) {
    return json({ errors: { reason: 'Choose why the stock is going back.' } }, 422);
  }
  if (!RETURN_REASONS.includes(reason)) {
    return json({
      errors: { reason: 'Reason must be one of: ' + RETURN_REASONS.join(', ') + '.' },
    }, 422);
  }
  const notes = String(body?.notes || '').trim();
  if (reason === 'Other' && !notes) {
    return json({ errors: { notes: 'Describe the reason when choosing "Other".' } }, 422);
  }

  const asked = (body?.barcodes || []).map((b) => String(b || '').trim()).filter(Boolean);
  if (!asked.length) {
    return json({ errors: { barcodes: 'Select or scan the items being returned.' } }, 422);
  }

  const unknown = asked.filter((c) => !(doc.lines || []).some((l) => l.barcodeNo === c));
  if (unknown.length) {
    return json({
      error: 'These barcodes are not on transfer ' + doc.transferNo + ': ' + unknown.slice(0, 10).join(', '),
      code: 'NOT_ON_TRANSFER', skipped: unknown,
    }, 422);
  }

  const already = asked.filter((c) => (doc.lines || []).some((l) => l.barcodeNo === c && l.returned));
  if (already.length) {
    /* Prevents the duplicate return the requirement calls out: the same unit
       cannot be sent back twice and reduce the bill twice. */
    return json({
      error: 'Already returned on this transfer: ' + already.slice(0, 10).join(', '),
      code: 'ALREADY_RETURNED', skipped: already,
    }, 409);
  }

  const updated = await withLocationPairLock(
    {
      businessId: doc.businessId, fromLocationId: doc.fromLocationId, toLocationId: doc.toLocationId,
      operation: 'stock-transfer:return', refNo: doc.transferNo, user: session,
    },
    async () => withTransaction(async (dbSession) => {
      const fresh = await StockTransfer.findById(id).session(dbSession || null);

      const target = asked.filter((c) =>
        (fresh.lines || []).some((l) => l.barcodeNo === c && !l.returned)
      );
      if (!target.length) {
        throw new InventoryError('ALREADY_RETURNED',
          'Those items were returned by someone else a moment ago.', { status: 409 });
      }

      const units = await loadUnits(target, { businessId: doc.businessId, session: dbSession });

      const { moved } = await returnToSource({
        units,
        transfer: fresh,
        fromLocationId: fresh.toLocationId,      // going back the other way
        toLocationId: fresh.fromLocationId,
        reason, notes,
        user: session, session: dbSession,
      });

      const movedNos = new Set(moved.map((u) => u.barcodeNo || u.barcodeGenerated));
      const now = new Date();
      const who = session.name || session.email || '';

      fresh.lines.forEach((l) => {
        if (!movedNos.has(l.barcodeNo)) return;
        l.returned = true;
        l.returnedAt = now;
        l.returnedBy = who;
        l.returnReason = reason;
        l.returnNotes = notes;
        /* a unit that goes back is not a received unit, whichever way round
           it happened - this is what keeps received + returned = settled */
        l.received = false;
        l.receivedAt = null;
      });

      fresh.recalc();
      fresh.deriveStatus();
      await fresh.save(dbSession ? { session: dbSession } : {});
      return fresh;
    })
  );

  return json({
    ok: true,
    status: updated.status,
    returnedQty: updated.returnedQty,
    returnedCount: updated.returnedCount,
    receivedQty: updated.receivedQty,
    billableQty: updated.billableQty,
    billableValue: updated.billableValue,
  });
});
