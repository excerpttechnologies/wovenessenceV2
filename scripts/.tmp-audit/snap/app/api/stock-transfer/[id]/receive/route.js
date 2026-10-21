import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer, { TRANSFER_STATUS } from '@/models/StockTransfer';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { withLocationPairLock } from '@/lib/locks';
import { withTransaction, loadUnits, receiveTransfer, InventoryError, BARCODE_STATUS } from '@/lib/inventory';

/* POST /api/stock-transfer/<id>/receive
   { barcodes: [...] }  - or omit to accept everything still in transit.

   The destination taking stock in. Partial by design: the operator scans what
   physically arrived, and whatever is not scanned stays in transit until it
   is either received later or returned. That is what makes
   "transferred 10, received 8, returned 2" representable at all.

   RECEIVING THE SAME TRANSFER TWICE IS IMPOSSIBLE, on two independent levels:
   the per-line `received` flag is checked here, and the barcode move is
   guarded on IN_TRANSIT in the engine. Either one alone would do; both are
   present because this is the step operators repeat when a page is slow. */

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id);
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  /* Authorised against the DESTINATION - a branch user may only receive what
     was addressed to their own location. */
  const session = await requirePermission(PERMISSIONS.TRANSFER_RECEIVE, { locationId: doc.toLocationId });

  if ([TRANSFER_STATUS.DRAFT, TRANSFER_STATUS.CANCELLED].includes(doc.status)) {
    return json({ error: 'This transfer is ' + doc.status.toLowerCase() + ' and cannot be received.', code: 'BAD_STATE' }, 409);
  }

  /* which lines are being accepted */
  const asked = (body?.barcodes || []).map((b) => String(b || '').trim()).filter(Boolean);
  const open = (doc.lines || []).filter((l) => !l.received && !l.returned);

  if (!open.length) {
    return json({
      error: 'Every line on this transfer has already been received or returned.',
      code: 'ALREADY_RECEIVED',
    }, 409);
  }

  const target = asked.length
    ? open.filter((l) => asked.includes(l.barcodeNo))
    : open;

  if (!target.length) {
    /* Told apart from "nothing left": the operator scanned something, and it
       is on the document but already settled - which is the double-scan case
       and deserves its own message. */
    const settled = asked.filter((c) => (doc.lines || []).some((l) => l.barcodeNo === c && (l.received || l.returned)));
    return json({
      error: settled.length
        ? 'Already handled on this transfer: ' + settled.slice(0, 10).join(', ')
        : 'None of those barcodes are on this transfer.',
      code: settled.length ? 'ALREADY_RECEIVED' : 'NOT_ON_TRANSFER',
    }, 409);
  }

  const unknown = asked.filter((c) => !(doc.lines || []).some((l) => l.barcodeNo === c));
  if (unknown.length) {
    return json({
      error: 'These barcodes are not on transfer ' + doc.transferNo + ': ' + unknown.slice(0, 10).join(', '),
      code: 'NOT_ON_TRANSFER',
      skipped: unknown,
    }, 422);
  }

  const updated = await withLocationPairLock(
    {
      businessId: doc.businessId, fromLocationId: doc.fromLocationId, toLocationId: doc.toLocationId,
      operation: 'stock-transfer:receive', refNo: doc.transferNo, user: session,
    },
    async () => withTransaction(async (dbSession) => {
      /* re-read the document inside the lock: another receiver may have
         settled some of these lines while this request was queuing */
      const fresh = await StockTransfer.findById(id).session(dbSession || null);
      const stillOpen = target.filter((t) =>
        (fresh.lines || []).some((l) => l.barcodeNo === t.barcodeNo && !l.received && !l.returned)
      );
      if (!stillOpen.length) {
        throw new InventoryError('ALREADY_RECEIVED',
          'Those lines were received by someone else a moment ago.', { status: 409 });
      }

      const units = await loadUnits(
        stillOpen.map((l) => l.barcodeNo),
        { businessId: doc.businessId, session: dbSession, prefer: BARCODE_STATUS.IN_TRANSIT }
      );

      const { moved } = await receiveTransfer({
        units,
        transfer: fresh,
        toLocationId: fresh.toLocationId,
        toBusinessId: fresh.businessId,
        toStockPointId: fresh.toStockPointId,
        user: session,
        session: dbSession,
      });

      const movedNos = new Set(moved.map((u) => u.barcodeNo || u.barcodeGenerated));
      const now = new Date();
      const who = session.name || session.email || '';

      fresh.lines.forEach((l) => {
        if (!movedNos.has(l.barcodeNo)) return;
        l.received = true;
        l.receivedAt = now;
        l.receivedBy = who;
      });

      fresh.recalc();
      fresh.deriveStatus();
      if (!fresh.receivedAt) fresh.receivedAt = now;
      fresh.receivedBy = who;

      await fresh.save(dbSession ? { session: dbSession } : {});
      return fresh;
    })
  );

  return json({
    ok: true,
    status: updated.status,
    receivedQty: updated.receivedQty,
    receivedCount: updated.receivedCount,
    pendingQty: updated.pendingQty,
    pendingCount: updated.pendingCount,
    billableQty: updated.billableQty,
  });
});
