#!/usr/bin/env node
/* ==============================================================================
   WAREHOUSE STOCK SEED - ENTRY POINT

   Usage (Windows):
     node scripts/seed-warehouse-stock.js --profile temple --file "C:\path\item_stock_item_wise_summary_20261019_052341(1).xlsx"
     node scripts/seed-warehouse-stock.js --profile suvarna --file "C:\path\suvarnafabric.xlsx"
     node scripts/seed-warehouse-stock.js --profile omshree --file "C:\path\omshreefabric.xlsx"
     node scripts/seed-warehouse-stock.js --profile suvarna --file "C:\path\suvarnafabric.xlsx" --confirm
     node scripts/seed-warehouse-stock.js --profile suvarna --backfill-item-ids --confirm

   This is deliberately a THIN launcher. The implementation lives in the
   existing seed script (scripts/seedHsrOpening.mjs, mode --warehouse-stock)
   so there is one DB connection, one BarcodeLabel model, one applyMovement
   ledger writer and one set of helpers - not a parallel importer.

   Profiles (scripts/seedHsrOpening.mjs, WS_PROFILES):
     temple   TEMPLE FABRICS WAREHOUSE, source temple_warehouse_excel_seed
     suvarna  SUVARNA FABRICS, source suvarna_excel_seed
     omshree  OMSHREE FABS, source omshree_excel_seed
   Reports go to ./seed_reports/<profile>/.

   Defaults: DRY_RUN=true, SKIP_ZERO_QTY=true, FIN_YEAR='2026-2027'.

   Flags:
     --profile <name>             temple | suvarna | omshree (default temple)
     --file <path>                Workbook (required)
     --confirm                    Write. Without it: dry run, reports only
     --warehouse-id <id>          Required when the profile business has more
                                  than one companylocation
     --include "<location>"       Add an extra Excel location; repeatable
     --include-jnr                Backwards-compatible alias for
                                  --include "TEMPLE FABRIC JNR"
     --include-zero               Include Close Qty <= 0 as SOLD
     --fin-year=YYYY-YYYY         Override financial year
     --source=<name>              Override barcodeLabel.source
     --chunk=<n>                  bulkWrite chunk size (default 500)
     --item-code-mode=barcode|master
     --batch-unique-case=title|lower
     --allow-existing-barcodes    Seed even if the barcode already exists in
                                  this business at another location/source
     --allow-missing-items        Seed rows with no Item master using the
                                  workbook itemCode/itemName and itemId=null.
                                  Never creates an Item master.
     --allow-cross-business-items Match an Item Name against another business's
                                  Item master and pass that itemId through.
                                  Opt-in; no Item row is copied or created.
     --backfill-item-ids          Do not seed. Only fill itemId on existing
                                  docs for the profile source/warehouse. Dry run
                                  unless --confirm is also given. No stock
                                  movements, quantities or batch types change.
     --allow-workbook-mismatch    Permit --confirm when the workbook's row /
                                  location facts do not match the profile
   ============================================================================== */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
const args = process.argv.slice(2);

if (!fs.existsSync(envFile)) {
  console.error(`❌ .env not found at ${envFile} - MONGODB_URI is required.`);
  process.exit(1);
}

const nodeArgs = [
  '--env-file=.env',
  '--import',
  './scripts/aliasRegister.mjs',
  path.join('scripts', 'seedHsrOpening.mjs'),
  '--warehouse-stock',
  ...args,
];

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('❌ Could not start the seed process:', result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
