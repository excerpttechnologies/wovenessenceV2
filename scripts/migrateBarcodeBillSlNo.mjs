/* RETIRED - superseded by scripts/repairBarcodeBillSlNo.mjs, which the
   npm entries now run. This file refuses.

   It did the same job - put the Bill Sl No. in the third part of every stored
   barcode value - but three things made it the wrong copy to keep:

     1. It wrote barcodeNo as well as barcodeGenerated. barcodeNo is the
        unit's own number: what the till scans, what a POS invoice line names,
        what the bars on an already printed label encode, and what
        lib/barcodeEngine.js counts on from. An earlier tool wrote display
        values into it and scripts/restoreBarcodeNumbers.mjs had to put 1,173
        rows back from a backup.

     2. Its "is this value already canonical?" check built the expected stem
        out of the first two segments OF THE VALUE IT WAS CHECKING, instead of
        out of the GRC and supplier it went on to load. A value carrying the
        wrong supplier code or the wrong GRC number was therefore declared
        already-correct and skipped.

     3. Its update filter pinned only the _id, with no if-unchanged guard, so
        a row someone else had edited in between would be overwritten rather
        than left alone.

   Its one run against this database (backups/barcode-migrations/
   barcode-bill-slno-migration-2026-09-16T07-54-07-137Z.json) skipped all
   23,908 rows with "Could not parse barcode value" and wrote nothing, so no
   data came from it.

   USE INSTEAD - same job, reviewed, and barcodeNo is never written:

     npm run barcodes:billslno           the plan, and an audit file
     npm run barcodes:billslno:apply     then write it
     npm run barcodes:billslno:verify    check the database afterwards

   Kept as a refusal rather than deleted so anyone running the old command, or
   following an old note, is told where the job moved. */

console.error([
  '',
  'scripts/migrateBarcodeBillSlNo.mjs has been retired and did nothing.',
  '',
  'It wrote barcodeNo - the number the till scans and the bars encode - which the',
  'reviewed tool never does, and it validated each value against itself.',
  '',
  'Use instead:',
  '  npm run barcodes:billslno           (the plan; changes nothing)',
  '  npm run barcodes:billslno:apply     (then apply it)',
  '  npm run barcodes:billslno:verify    (check the database afterwards)',
  '',
].join('\n'));

process.exit(1);
