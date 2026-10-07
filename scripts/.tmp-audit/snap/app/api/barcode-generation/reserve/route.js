import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { planBarcodes, reserveBarcodeNumbers, loadFormat, uomTypeOf, batchTypeOf } from '@/lib/barcodeEngine';

/* POST /api/barcode-generation/reserve
   { uom, batchType, qty, cuts?, business, finYear }

   Works out how many barcodes a line produces and RESERVES those numbers
   from the atomic counter, returning them to the screen.

   Why the screen does not number its own rows any more: it used to, from a
   counter held in the browser (sequenceRef in GCRBarcodeGeneration). Two
   people generating at the same time both started from whatever they had
   last read, so they printed overlapping numbers - and a duplicate barcode on
   two physical garments is unrecoverable once they are on the shop floor.

   Reserving up front rather than at save keeps the operator's own guarantee
   intact: the number on the preview, on the printed label and in the database
   are the same number. A reservation that is never saved simply leaves a gap
   in the series, which is the correct trade - gaps are harmless, collisions
   are not.

   The plan it returns is the client-visible form of the rule in
   lib/barcodeEngine.js:
     PC  + batch  qty 1 -> 1 barcode
     PC  + unique qty 5 -> 5 barcodes
     MTR + batch  qty 5 -> 1 barcode of 5 mtr
     MTR + unique qty 5 -> 5 barcodes, one per cut                       */

export const POST = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE);
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  const { uom, batchType, qty, cuts = [], business, finYear = '' } = body || {};

  /* throws BarcodePlanError (422 via apiError) on a quantity that cannot
     produce a sane label count - a wrong count is a physical stock error */
  const plan = planBarcodes({ uom, batchType, qty, cuts });

  const format = await loadFormat(business, finYear);
  const numbers = await reserveBarcodeNumbers(plan.length, { businessId: business, finYear, setting: format });

  void session;
  return json({
    ok: true,
    uomType: uomTypeOf(uom),
    batchType: batchTypeOf(batchType),
    count: plan.length,
    /* what each generated label will carry */
    rows: plan.map((p, i) => ({
      barcodeNo: numbers[i],
      qty: p.qty,
      uomType: p.uomType,
      batchType: p.batchType,
      groupId: p.groupId,
      index: p.index,
    })),
    format: { prefix: format.prefix, suffix: format.suffix, width: format.width },
  });
});
