import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler, json } from '@/lib/apiError';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { barcodeHistory, shape, InventoryError, SCAN_ERRORS } from '@/lib/inventory';
import CompanyLocation from '@/models/CompanyLocation';
import Contact from '@/models/Contact';
import Grc from '@/models/Grc';

/* GET /api/barcode/<code>
   The full traceable life of one barcode: what it is, where it is now, and
   every event that moved it - GRC in, transfer out, received, returned,
   sold, returned by the customer.

   This is the requirement that the barcode "remain a traceable reference
   throughout the inventory lifecycle" made answerable. Before the movement
   ledger existed there was nothing to answer it with.

   Also what the document-number and barcode-label scans resolve against. */

export const GET = handler(async (req, { params }) => {
  const session = await requireUser();
  const { code } = await params;
  await dbConnect();

  const text = String(code || '').trim();
  const unit = await BarcodeLabel.findOne({
    $or: [{ barcodeNo: text }, { barcodeGenerated: text }],
  }).lean();

  if (!unit) {
    throw new InventoryError(SCAN_ERRORS.NOT_FOUND,
      'Barcode ' + text + ' is not in the system.', { status: 404 });
  }

  const events = await barcodeHistory(unit.barcodeNo || unit.barcodeGenerated);

  /* Resolve the ids the trail refers to, in one round trip each, so the
     screen renders names rather than object ids. */
  const locationIds = [...new Set(
    events.flatMap((e) => [e.fromLocationId, e.toLocationId])
      .concat([unit.currentLocationId, unit.locationId])
      .filter(Boolean).map(String)
  )];

  const [locations, supplier, grc] = await Promise.all([
    locationIds.length
      ? CompanyLocation.find({ _id: { $in: locationIds } }).select('name businessPrintName').lean()
      : [],
    unit.supplierId
      ? Contact.findById(unit.supplierId).select('businessName firstName lastName contactId').lean().catch(() => null)
      : null,
    unit.grcId
      ? Grc.findById(unit.grcId).select('grcNumber grcDate').lean().catch(() => null)
      : null,
  ]);

  const locName = new Map(locations.map((l) => [String(l._id), l.name || l.businessPrintName || '']));
  const nameOf = (id) => (id ? locName.get(String(id)) || '' : '');

  void session;
  return json({
    ok: true,
    unit: {
      ...shape(unit),
      currentLocation: nameOf(unit.currentLocationId),
      originLocation: nameOf(unit.locationId),
      supplierName: supplier
        ? [supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '),
           supplier.contactId ? '[' + supplier.contactId + ']' : ''].filter(Boolean).join(' ')
        : '',
      grcNo: grc?.grcNumber || unit.grcNo || '',
      grcDate: grc?.grcDate || null,
    },
    history: events.map((e) => ({
      _id: String(e._id),
      type: e.type,
      qty: e.qty,
      at: e.at,
      from: nameOf(e.fromLocationId),
      to: nameOf(e.toLocationId),
      statusBefore: e.statusBefore,
      statusAfter: e.statusAfter,
      refModel: e.refModel,
      refId: e.refId ? String(e.refId) : '',
      refNo: e.refNo,
      reason: e.reason,
      notes: e.notes,
      user: e.userName || e.userEmail || '',
    })),
  });
});
