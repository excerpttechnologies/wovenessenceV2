import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer from '@/models/StockTransfer';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { withLocationPairLock } from '@/lib/locks';
import { withTransaction, loadUnits, receiveReturnAtSource, InventoryError, BARCODE_STATUS } from '@/lib/inventory';

/* POST /api/stock-transfer/<id>/accept-return
   { barcodes: [...] }  - or omit to take back everything on its way.

   The SOURCE closing the loop: stock the destination sent back is put into
   the source's own stock again, and the movement is recorded against the
   original transfer so the whole round trip reads as one story.

   Until this runs, a returned unit is RETURN_IN_TRANSIT - it belongs to
   neither location's sellable stock, which is the honest position while a
   carton is on a lorry. */

export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await StockTransfer.findById(id);
  if (!doc) return json({ error: 'Transfer not found.', code: 'NOT_FOUND' }, 404);

  /* the SOURCE takes returns back */
  const session = await requirePermission(PERMISSIONS.TRANSFER_RETURN_RECEIVE, { locationId: doc.fromLocationId });

  const outstanding = (doc.lines || []).filter((l) => l.returned && !l.returnAccepted);
  if (!outstanding.length) {
    return json({
      error: 'There is nothing on this transfer waiting to be taken back.',
      code: 'NOTHING_PENDING',
    }, 409);
  }

  const asked = (body?.barcodes || []).map((b) => String(b || '').trim()).filter(Boolean);
  const target = asked.length
    ? outstanding.filter((l) => asked.includes(l.barcodeNo))
    : outstanding;

  if (!target.length) {
    return json({
      error: 'None of those barcodes are waiting to be taken back on this transfer.',
      code: 'NOTHING_PENDING',
    }, 409);
  }

  const updated = await withLocationPairLock(
    {
      businessId: doc.businessId, fromLocationId: doc.fromLocationId, toLocationId: doc.toLocationId,
      operation: 'stock-transfer:accept-return', refNo: doc.transferNo, user: session,
    },
    async () => withTransaction(async (dbSession) => {
      const fresh = await StockTransfer.findById(id).session(dbSession || null);

      const stillOpen = target.filter((t) =>
        (fresh.lines || []).some((l) => l.barcodeNo === t.barcodeNo && l.returned && !l.returnAccepted)
      );
      if (!stillOpen.length) {
        throw new InventoryError('NOTHING_PENDING',
          'Those returns were taken back by someone else a moment ago.', { status: 409 });
      }

      const units = await loadUnits(
        stillOpen.map((l) => l.barcodeNo),
        { businessId: doc.businessId, session: dbSession, prefer: BARCODE_STATUS.RETURN_IN_TRANSIT }
      );

      const { moved } = await receiveReturnAtSource({
        units,
        ref: { _id: fresh._id, transferNo: fresh.transferNo, returnNo: fresh.transferNo },
        locationId: fresh.fromLocationId,
        businessId: fresh.businessId,
        stockPointId: null,
        user: session, session: dbSession,
      });

      const movedNos = new Set(moved.map((u) => u.barcodeNo || u.barcodeGenerated));
      const now = new Date();
      const who = session.name || session.email || '';

      fresh.lines.forEach((l) => {
        if (!movedNos.has(l.barcodeNo)) return;
        l.returnAccepted = true;
        l.returnAcceptedAt = now;
      });

      fresh.returnReceivedAt = now;
      fresh.returnReceivedBy = who;
      fresh.recalc();
      fresh.deriveStatus();
      await fresh.save(dbSession ? { session: dbSession } : {});
      return fresh;
    })
  );

  const stillOut = (updated.lines || []).filter((l) => l.returned && !l.returnAccepted).length;

  return json({
    ok: true,
    status: updated.status,
    acceptedCount: updated.returnedCount - stillOut,
    pendingReturns: stillOut,
    billableQty: updated.billableQty,
    billableValue: updated.billableValue,
  });
});
