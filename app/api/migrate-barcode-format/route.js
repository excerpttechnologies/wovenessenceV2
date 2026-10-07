import { NextResponse } from 'next/server';

/* POST /api/migrate-barcode-format - RETIRED, and it refuses.

   WHAT IT DID. It rewrote every composed barcode value in the collection by
   swapping the last two parts of the string:

     OLD: PREFIX * GRC_NO * SERIAL_NUMBER * QUANTITY
     NEW: PREFIX * GRC_NO * QUANTITY * SERIAL_NUMBER

   WHY IT CANNOT. The third part of a barcode value is no longer the quantity.
   It is the Bill Sl No. - the bill line the item was received on, as the GRC's
   Item Summary shows it (lib/barcodeValue.js). That number is NOT in the old
   string, so it cannot be recovered by re-ordering one: it has to be read from
   the barcode row itself. Anything this endpoint produced now would be a
   quantity sitting where a bill line belongs, on every barcode of the
   business, in one unauthenticated POST.

   Two more reasons it is not simply pointed at the new rule. It wrote
   barcodeNo as well as barcodeGenerated - barcodeNo is the per-unit handle the
   till, the stock ledger and every POS invoice line resolve a physical unit
   through - and it had no dry run, no backup and no confirmation.

   WHAT TO USE INSTEAD. scripts/restateGrcBarcodes.mjs, which reports what it
   would do and changes nothing until it is asked to:

     npm run barcodes:restate -- --all          look at the plan
     npm run barcodes:restate -- --all --apply  then apply it

   It writes barcodeGenerated only, never barcodeNo; it leaves a unit with no
   Bill Sl No. alone and reports it; and it refuses a value another barcode of
   the business already carries.

   Kept as a refusal rather than deleted so a bookmark, a script or a runbook
   that still posts here is told why, instead of quietly succeeding. */

const GONE = {
  error: 'This migration has been retired. The third part of a barcode value is now the Bill Sl No. '
    + '(SUPPLIER CODE * GRC NUMBER * BILL SL NO * SEQ), which cannot be recovered by re-ordering an old value - '
    + 'it is read from the barcode row. Use "npm run barcodes:restate -- --all" to see the plan and '
    + '"npm run barcodes:restate -- --all --apply" to apply it: it writes barcodeGenerated only, never barcodeNo, '
    + 'and it leaves any unit with no Bill Sl No. untouched.',
  code: 'MIGRATION_RETIRED',
};

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}
