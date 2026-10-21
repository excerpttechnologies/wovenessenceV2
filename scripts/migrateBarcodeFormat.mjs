/* RETIRED - this script refuses to run.

   It rewrote every composed barcode value by swapping the last two parts of
   the string:

     OLD: PREFIX * GRC_NO * SERIAL_NUMBER * QUANTITY
     NEW: PREFIX * GRC_NO * QUANTITY * SERIAL_NUMBER

   The third part of a barcode value is no longer the quantity. It is the Bill
   Sl No. - the bill line the item was received on, as the GRC's Item Summary
   shows it against that item (lib/barcodeValue.js). That number is not in the
   old string and cannot be recovered by re-ordering one; it has to be read
   from the barcode row.

   It also wrote barcodeNo, the per-unit handle the till and the stock ledger
   resolve a unit through, and it decided what was already migrated with a
   heuristic ("the third part looks like a big number, so it is probably a
   quantity") - which cannot tell a bill line from a quantity at all.

   scripts/restateGrcBarcodes.mjs does this job properly: it prints the plan
   and changes nothing until --apply, writes barcodeGenerated only, composes
   from each unit's OWN stored Bill Sl No., leaves a unit that has none alone,
   and refuses a value another barcode of the business already carries.

     npm run barcodes:restate -- --all
     npm run barcodes:restate -- --all --apply

   Kept as a refusal rather than deleted so anyone who runs it is told why. */

console.error([
  '',
  'scripts/migrateBarcodeFormat.mjs has been retired and did nothing.',
  '',
  'The third part of a barcode value is now the Bill Sl No., not the quantity:',
  '  SUPPLIER CODE * GRC NUMBER * BILL SL NO * SEQ     e.g. G512 * 05173 * 5 * 1',
  'A bill line cannot be recovered by re-ordering an old value - it is read from',
  'the barcode row itself.',
  '',
  'Use instead:',
  '  npm run barcodes:restate -- --all           (the plan; changes nothing)',
  '  npm run barcodes:restate -- --all --apply   (then apply it)',
  '',
].join('\n'));

process.exit(1);
