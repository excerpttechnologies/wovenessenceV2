/*
 * RETIRED - this runner refuses.
 *
 * It POSTed /api/migrate-barcode-format, which rewrote every composed barcode
 * value by swapping the last two parts of the string:
 *
 *   OLD: PREFIX * GRC_NO * SERIAL_NUMBER * QUANTITY
 *   NEW: PREFIX * GRC_NO * QUANTITY * SERIAL_NUMBER
 *
 * The third part of a barcode value is no longer a quantity. It is the Bill
 * Sl No. - the bill line the item was received on, as the GRC's Item Summary
 * shows it (lib/barcodeValue.js) - and that number is not in the old string
 * at all, so it cannot be recovered by re-ordering one. The endpoint itself
 * now answers 410 for the same reason.
 *
 * To restate stored values under the current rule, use the reviewed script:
 * it prints the plan and changes nothing until --apply, writes
 * barcodeGenerated only (never barcodeNo, the per-unit handle the till
 * resolves), composes from each unit's OWN stored Bill Sl No., and leaves a
 * unit that has none alone.
 *
 *   npm run barcodes:restate -- --all
 *   npm run barcodes:restate -- --all --apply
 */

console.error([
  '',
  'scripts/run-migration.js has been retired and did nothing.',
  '',
  'The third part of a barcode value is now the Bill Sl No., not the quantity:',
  '  SUPPLIER CODE * GRC NUMBER * BILL SL NO * SEQ     e.g. G512 * 05173 * 5 * 1',
  'It is read from the barcode row, so no re-ordering of an old value can produce it.',
  '',
  'Use instead:',
  '  npm run barcodes:restate -- --all           (the plan; changes nothing)',
  '  npm run barcodes:restate -- --all --apply   (then apply it)',
  '',
].join('\n'));

process.exit(1);
