import mongoose, { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { nextSerialNo, highestSerialNo, serialFloorOf } from '@/lib/barcodeValue';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* GET /api/barcode-generation/next-serial?grcId=...&billSlNo=...
   Returns the next Serial No. for the given GRC and Bill Sl No.

   A preview only - nothing is reserved. It is worked out by the same rule
   the save route numbers a new barcode with (lib/barcodeValue.js): after the
   highest serial the line's stored VALUES carry, and after the highest the
   GRC ever gave on that line. */
export const GET = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE);
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const grcId = sp.get('grcId');
  const billSlNo = sp.get('billSlNo');

  if (!grcId || !isValidObjectId(grcId)) {
    return json({ error: 'Valid grcId is required', code: 'BAD_INPUT' }, 400);
  }
  if (!billSlNo || !String(billSlNo).trim()) {
    return json({ error: 'Bill Sl No. is required', code: 'BAD_INPUT' }, 400);
  }

  /* Roles & Permissions (17-10-2026): a preview while working a GRC's
     barcodes - GRC Read, Create or Update */
  {
    const rec = await Grc.findById(grcId).select('businessId').lean();
    if (rec) {
      const denied = await screenDenialAnyAction({ session, screens: [SCREENS.GRC], actions: [PERM.READ, PERM.CREATE, PERM.UPDATE], businessId: rec.businessId, label: 'GRC' });
      if (denied) return json({ error: denied.message, code: denied.code }, 403);
    }
  }

  const [existingBarcodes, grc] = await Promise.all([
    BarcodeLabel.find({ grcId: String(grcId) })
      .select('billSlNo serialNo seq barcodeNo barcodeGenerated')
      .lean(),
    /* read raw: lastSerialByBill must come back exactly as stored - absent
       on a GRC that has never numbered serials per line */
    Grc.collection.findOne(
      { _id: new mongoose.Types.ObjectId(String(grcId)) },
      { projection: { lastSerialByBill: 1, serialFloorBase: 1, lastBarcodeSeq: 1 } }
    ),
  ]);

  const highest = highestSerialNo(existingBarcodes, billSlNo);
  const next = nextSerialNo(existingBarcodes, billSlNo, serialFloorOf(grc, billSlNo, existingBarcodes));

  return json({
    ok: true,
    grcId,
    billSlNo,
    highestExistingSerialNo: highest,
    nextSerialNo: next,
  });
});
