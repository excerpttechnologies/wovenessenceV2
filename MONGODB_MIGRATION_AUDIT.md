# MongoDB Migration Audit

Generated: 2026-11-06T06:38:10.270Z

## Scope

- **Source database:** `test` at mongodb+srv://cluster0.dagaqhc.mongodb.net
- **Target database:** `grooretailerp1` at mongodb://69.197.176.100:27017
- Credentials are read from environment variables only; no URI, user or password is recorded here.
- Source database selection: SOURCE_DB_NAME (visible candidates: grooretailerp1_web, test, woven_essence_web).
- **Write policy:** target is never dropped, truncated or overwritten. Existing `_id`s are compared and conflicts abort the run.

## Migration state at audit time

- This audit is read-only and shows the databases as they are **now** (2026-11-06T06:38:10.270Z); target counts are not a pre-migration snapshot.
- Initial migration checkpoint: 128/128 collections complete; 163603 documents inserted; 163603 scanned; 0 conflicts; finished 2026-11-05T06:35:43.092Z in 1000s.
- Last incremental sync: complete; scanned 163603; inserted 0; already identical 163603; conflicts 0; finished 2026-11-06T06:18:06.910Z in 709s.

## Discovered totals

| Metric | Value |
| --- | --- |
| Source collections | 141 |
| Target collections at audit time | 128 |
| Source documents (all collections) | 187302 |
| Target documents (all collections) | 163603 |
| INCLUDE collections | 128 |
| INCLUDE documents | 163603 |
| EXCLUDE collections | 13 |
| EXCLUDE documents | 23699 |
| DECISION REQUIRED collections | 0 |
| DECISION REQUIRED documents | 0 |
| Collections with a current Mongoose model | 99 |
| Legacy / unreferenced source collections | 42 |
| Model collections absent from source | 0 |

## Critical finding — the named BarcodeLabel collection

`barcodeLabel` is **not** a label-printing-only collection in this repository. `lib/barcodeLabel.js` defines it as *"ONE ROW IS ONE UNIT OF STOCK"*: it carries `barcodeNo`, `itemId`, `qtyNum`, `status`, `currentLocationId`, `transferId`, `receivedId`, `billingId`, `soldAt` and the commercial fields. GRC, stock movement, transfers, delivery challans, sales and the barcode search all resolve through it.

There is no second `Barcode` model or `barcode` collection in the source database. The only barcode unit data is this collection. Excluding it drops every barcode/stock unit and leaves `barcodeId` references in `stockmovement`, GRC, transfer and sales documents dangling.

**Decision recorded: EXCLUDE `barcodeLabel` (confirmed by the project owner).** The migration will not copy these documents. The unresolved barcode references are an accepted consequence of that decision and are reported again in `MONGODB_MIGRATION_RESULTS.md`.

## A. Collections to migrate

| Collection | Model | Module | Source docs | Target docs | Refs | Source indexes | Category | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| accountingsettings | accountingSettings | Accounting | 2 | 2 | accountsMaster, business, companyLocation | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| accountsmaster | accountsMaster | Accounting | 50 | 50 | accountsMaster, business, companyLocation | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| adminusers | — (no current model) | Legacy / external | 2 | 2 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| agent | agent | Purchase / GRC | 8 | 8 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| attributeaddon | attributeAddon | Inventory / Masters | 4 | 4 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| attributedefinitions | — (no current model) | Legacy / external | 12 | 12 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| auditlogs | — (no current model) | Legacy / external | 36 | 36 | — | 6 | SHARED | Shared audit log; may contain POS actions but is not POS-owned. |
| auditLogs | — (no current model) | Legacy / external | 24 | 24 | — | 1 | SHARED | Legacy shared audit log. |
| b2binvoice | b2bInvoice | Sales | 0 | 0 | business, companyLocation | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| banners | — (no current model) | Legacy / external | 0 | 0 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| barcodeitem | barcodeItem | Barcode | 0 | 0 | business, companyLocation | 12 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| barcodelabelsetting | barcodeLabelSetting | Barcode | 4 | 4 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| barcodeprintbatch | barcodePrintBatch | Barcode | 0 | 0 | barcodeLabelSetting, business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| barcodesetting | barcodeSetting | Barcode | 18 | 18 | business | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| branches | — (no current model) | Legacy / external | 4 | 4 | — | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| business | business | Masters / Admin | 4 | 4 | business | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| businesscontact | businessContact | Masters / Admin | 1 | 1 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| carts | — (no current model) | Legacy / external | 9 | 9 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| catalogs | catalog | Configuration / Web | 24 | 24 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| categories | — (no current model) | Legacy / external | 0 | 0 | — | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| category | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| cities | city | Masters / Admin | 18 | 18 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| citygroup | cityGroup | Masters / Admin | 4 | 4 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| collections | — (no current model) | Legacy / external | 0 | 0 | — | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| companylocation | companyLocation | Masters / Admin | 12 | 12 | business | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| contact | contact | Masters / Admin | 58125 | 58125 | business, contact, contactType, ledger, purchaseTerm, salesTerm, transporter | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| contacttype | contactType | Masters / Admin | 11 | 11 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| counter | counter | Masters / Admin | 66 | 66 | — | 2 | SHARED | Atomic sequence generator shared by POS and every other document series; contains no POS transaction. |
| couponredemptions | — (no current model) | Legacy / external | 1 | 1 | — | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| coupons | — (no current model) | Legacy / external | 1 | 1 | — | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| creditnote | creditNote | Sales | 0 | 0 | business, companyLocation | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| customer | customer | Sales | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| customers | — (no current model) | Legacy / external | 10 | 10 | — | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| debitnote | debitNote | Sales | 2 | 2 | agent, business, companyLocation, logistic | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| delivery | delivery | Sales | 46 | 46 | business, companyLocation, contact, dispatch, supplier, transporter | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| deliverychallan | deliveryChallan | Sales | 6 | 6 | agent, business, companyLocation, customer, ledger, logistic, purchaseGroup, stockPoint, stockTransferLocation, stockTransferReceived | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| dispatch | dispatch | Sales | 2 | 2 | business, companyLocation, delivery, driver, transportRoute, vehicle | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| docsetup | docSetup | Masters / Admin | 13 | 13 | business | 5 | SHARED | Document-number setup shared by all modules. |
| driver | driver | Masters / Admin | 1 | 1 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceproduct | ecommerceProduct | Configuration / Web | 8 | 8 | business, item, productClassificationOption | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceProduct | — (no current model) | Legacy / external | 1 | 1 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceproducts | — (no current model) | Legacy / external | 15653 | 15653 | — | 14 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceProducts | — (no current model) | Legacy / external | 23962 | 23962 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecomproduct | — (no current model) | Legacy / external | 0 | 0 | — | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecomsetting | ecomSetting | Configuration / Web | 1 | 1 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| erpSyncErrors | — (no current model) | Legacy / external | 230 | 230 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| erpSyncRuns | — (no current model) | Legacy / external | 24 | 24 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| goodsReceived | — (no current model) | Legacy / external | 9 | 9 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| goodstype | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| grc | grc | Purchase / GRC | 147 | 147 | agent, business, companyLocation, delivery, logistic, purchaseGroup, purchaseTerm, stockPoint, supplier | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| groups | — (no current model) | Legacy / external | 20 | 20 | — | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| groupsessions | — (no current model) | Legacy / external | 1 | 1 | — | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| grt | grt | Purchase / GRC | 3 | 3 | agent, business, companyLocation, logistic, purchaseGroup, purchaseTerm, supplier | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| hsn | hsn | Inventory / Masters | 121 | 121 | business, tax | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| hsrimportjob | hsrImportJob | Other ERP | 0 | 0 | business, companyLocation, user | 9 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icautopurchasereceived | icAutoPurchaseReceived | Inter Company | 3 | 3 | business, companyLocation, grc, icSalesInvoice | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icautopurchasereturn | icAutoPurchaseReturn | Inter Company | 3 | 3 | agent, business, companyLocation, contact, logistic, stockPoint, supplier | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icdeliverychallan | icDeliveryChallan | Inter Company | 45 | 45 | business, companyLocation, contact, logistic, stockPoint | 9 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| iciteminvoice | icItemInvoice | Inter Company | 20 | 20 | business, companyLocation | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icpurchasereceived | icPurchaseReceived | Inter Company | 9 | 9 | business, companyLocation, icItemInvoice | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icreversedeliverychallan | — (no current model) | Legacy / external | 1 | 1 | — | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icsalesinvoice | icSalesInvoice | Inter Company | 3 | 3 | business, companyLocation, icDeliveryChallan | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icsalesreturn | icSalesReturn | Inter Company | 3 | 3 | business, companyLocation, icAutoPurchaseReturn | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| invoicelayoutsetting | invoiceLayoutSetting | Configuration / Web | 3 | 3 | business, companyLocation | 3 | SHARED | Invoice layout configuration; a setting, not a POS transaction. |
| item | item | Inventory / Masters | 411 | 411 | business, hsn, productFilter, productGroup, uom | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| items | — (no current model) | Legacy / external | 18790 | 18790 | — | 9 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| itemwiseimportjob | itemWiseImportJob | Inventory / Masters | 5 | 5 | — | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| journalentry | journalEntry | Accounting | 1 | 1 | accountsMaster, business, companyLocation, journalEntry | 7 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ledger | ledger | Accounting | 3 | 3 | business, ledgerGroup | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ledgergroup | ledgerGroup | Accounting | 99 | 99 | business, ledgerGroup | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ledgergroupmapping | ledgerGroupMapping | Accounting | 1 | 1 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ledgersetting | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| locationsetting | locationSetting | Masters / Admin | 1 | 1 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| loginsecurity | loginSecurity | Masters / Admin | 1 | 1 | business | 3 | SHARED | Login/security records shared by all users. |
| logistic | logistic | Masters / Admin | 2 | 2 | business, companyLocation, supplier | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| orders | — (no current model) | Legacy / external | 21 | 21 | — | 12 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| pincode | pincode | Masters / Admin | 25 | 25 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| procurementtype | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| productclassificationoption | productClassificationOption | Inventory / Masters | 184 | 184 | business | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| productfilter | productFilter | Inventory / Masters | 1 | 1 | business, productFilter | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| productgroup | productGroup | Inventory / Masters | 116 | 116 | business, productGroup | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| productImage | ProductImage | Barcode | 10 | 10 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| producttypes | — (no current model) | Legacy / external | 16 | 16 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchasecharge | purchaseCharge | Purchase / GRC | 7 | 7 | business, ledger | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchasegroup | purchaseGroup | Purchase / GRC | 21 | 21 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchaseinvoice | purchaseInvoice | Purchase / GRC | 28 | 28 | agent, business, companyLocation, contact, logistic, purchaseGroup, purchaseTerm, supplier | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchaseratecode | purchaseRateCode | Purchase / GRC | 1 | 1 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchasesetting | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchaseterm | purchaseTerm | Purchase / GRC | 7 | 7 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| role | role | Masters / Admin | 4 | 4 | business | 3 | SHARED | Role master shared by the whole application. |
| rolepermission | rolePermission | Masters / Admin | 7 | 7 | business | 4 | SHARED | Permission matrix shared by the whole application (includes POS screens). |
| salescharge | — (no current model) | Legacy / external | 0 | 0 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| salesinvoice | salesInvoice | Sales | 1 | 1 | business, companyLocation, customer | 9 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| salesperson | salesPerson | Sales | 5 | 5 | business | 3 | SHARED | Staff master used by sales screens and POS; not a POS transaction. |
| salesreturn | salesReturn | Sales | 1 | 1 | business, companyLocation, customer | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| salesterm | salesTerm | Sales | 0 | 0 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| schemamigration | — (no current model) | Legacy / external | 1 | 1 | — | 1 | SHARED | Migration bookkeeping, shared. |
| sitesettings | — (no current model) | Legacy / external | 1 | 1 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| splitbarcodesetting | splitBarcodeSetting | Barcode | 2 | 2 | business | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stockadjustment | stockAdjustment | Inventory / Masters | 79 | 79 | business, companyLocation, stockPoint | 5 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stockmovement | stockMovement | Inventory / Masters | 43641 | 43641 | business, companyLocation, item | 17 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stockpoint | stockPoint | Inventory / Masters | 8 | 8 | business, companyLocation, stockPoint | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stocktransfer | stockTransfer | Inventory / Masters | 0 | 0 | business, companyLocation, item, stockPoint | 12 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stocktransferlocation | stockTransferLocation | Inventory / Masters | 3 | 3 | business, companyLocation, stockPoint, stockTransferPacket | 11 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stocktransferpacket | stockTransferPacket | Inventory / Masters | 3 | 3 | business, companyLocation, stockPoint | 10 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| stocktransferreceived | stockTransferReceived | Inventory / Masters | 3 | 3 | business, companyLocation, stockPoint, stockTransferLocation | 11 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storedebitnote | storeDebitNote | Inter Store Sell | 0 | 0 | business, companyLocation, storeSalesInvoice | 10 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storedeliverychallan | storeDeliveryChallan | Inter Store Sell | 2 | 2 | business, companyLocation, stockPoint, storeSalesInvoice | 11 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storefrontGroups | — (no current model) | Legacy / external | 17 | 17 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storefrontSettings | — (no current model) | Legacy / external | 2 | 2 | — | 1 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storesalesinvoice | storeSalesInvoice | Inter Store Sell | 0 | 0 | business, companyLocation | 10 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storesalesreturn | storeSalesReturn | Inter Store Sell | 0 | 0 | business, companyLocation, storeSalesInvoice | 10 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| subgroups | — (no current model) | Legacy / external | 31 | 31 | — | 10 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| supplier | supplier | Purchase / GRC | 801 | 801 | — | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| synclogs | — (no current model) | Legacy / external | 73 | 73 | — | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| tax | tax | Inventory / Masters | 15 | 15 | business, ledger | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| transferlock | transferLock | Inventory / Masters | 0 | 0 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| transporter | transporter | Masters / Admin | 17 | 17 | business, companyLocation | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| transportroute | transportRoute | Masters / Admin | 1 | 1 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| uom | uom | Inventory / Masters | 15 | 15 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| user | user | Masters / Admin | 10 | 10 | business, companyLocation, posCounter | 3 | SHARED | User accounts shared by the whole application (cashier counterId is one field). |
| vehicle | vehicle | Masters / Admin | 2 | 2 | business, companyLocation | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| visits | — (no current model) | Legacy / external | 304 | 304 | — | 4 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| voucher | voucher | Accounting | 3 | 3 | business, companyLocation, ledger | 8 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| vouchersetting | voucherSetting | Accounting | 0 | 0 | business | 3 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| websiteevent | — (no current model) | Legacy / external | 0 | 0 | — | 14 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| websiteevents | WebsiteEvent | Configuration / Web | 0 | 0 | — | 6 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| wishlists | — (no current model) | Legacy / external | 10 | 10 | — | 2 | ERP | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |

## B. Collections excluded from migration

| Collection | Category | Source docs | Target docs | Reason |
| --- | --- | --- | --- | --- |
| barcodeLabel | BARCODE_LABEL | 23580 | 0 | STRICT EXCLUSION: caller chose to drop the barcodeLabel collection. This removes every barcode unit row and leaves barcodeId references in stockmovement/GRC/transfer/sales documents dangling. |
| cashregister | POS | 2 | 0 | POS cash-register sessions and counts (models/CashRegister.js). |
| invoiceshare | POS | 1 | 0 | Shared POS invoice PDF links; created only from app/api/invoice-share for posinvoice rows. |
| loyaltyledger | POS | 9 | 0 | POS loyalty point movements written by app/api/sell-pos (models/LoyaltyLedger.js). |
| loyaltypoint | POS | 1 | 0 | POS loyalty scheme settings (models/LoyaltyPoint.js). |
| loyaltytransaction | POS | 9 | 0 | Legacy POS loyalty movement collection (same data shape as loyaltyledger). |
| paymentmethod | POS | 0 | 0 | POS payment-method master; every record is scoped to a posCounter (models/PaymentMethod.js). |
| poscounter | POS | 4 | 0 | POS counter master (models/PosCounter.js). |
| posfootertemplate | POS | 0 | 0 | POS invoice footer templates (models/PosFooterTemplate.js). |
| poshold | POS | 0 | 0 | Held POS carts (models/PosHold.js). |
| posinvoice | POS | 83 | 0 | POS bill/transaction collection (models/PosInvoice.js, app/api/sell-pos). |
| posreturn | POS | 8 | 0 | POS return/credit collection (models/PosReturn.js). |
| possetting | POS | 2 | 0 | POS till configuration (models/PosSetting.js). |

## C. Complete Mongoose model inventory

| Model | Collection | Module | Source file(s) | Refs | Indexes declared | Source docs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| accountingSettings | accountingsettings | Accounting | models/AccountingSettings.js | accountsMaster, business, companyLocation | 1 | 2 | INCLUDE |
| accountsMaster | accountsmaster | Accounting | models/AccountsMaster.js | accountsMaster, business, companyLocation | 3 | 50 | INCLUDE |
| agent | agent | Purchase / GRC | models/Agent.js | — | 0 | 8 | INCLUDE |
| attributeAddon | attributeaddon | Inventory / Masters | models/AttributeAddon.js | business | 0 | 4 | INCLUDE |
| b2bInvoice | b2binvoice | Sales | models/B2bInvoice.js | business, companyLocation | 0 | 0 | INCLUDE |
| barcodeItem | barcodeitem | Barcode | models/BarcodeItem.js | business, companyLocation | 0 | 0 | INCLUDE |
| barcodeLabel | barcodeLabel | Barcode | lib/barcodeLabel.js | business, companyLocation, item, stockPoint, uom | 15 | 23580 | EXCLUDE |
| barcodeLabelSetting | barcodelabelsetting | Barcode | models/BarcodeLabelSetting.js | business, companyLocation | 0 | 4 | INCLUDE |
| barcodePrintBatch | barcodeprintbatch | Barcode | models/BarcodePrintBatch.js | barcodeLabelSetting, business, companyLocation | 0 | 0 | INCLUDE |
| barcodeSetting | barcodesetting | Barcode | models/BarcodeSetting.js | business | 1 | 18 | INCLUDE |
| business | business | Masters / Admin | models/Business.js | business | 0 | 4 | INCLUDE |
| businessContact | businesscontact | Masters / Admin | models/BusinessContact.js | — | 0 | 1 | INCLUDE |
| cashRegister | cashregister | POS | models/CashRegister.js | business, companyLocation, posCounter | 1 | 2 | EXCLUDE |
| catalog | catalogs | Configuration / Web | app/api/catalog/route.js | — | 0 | 24 | INCLUDE |
| city | cities | Masters / Admin | app/api/cities/route.js | — | 0 | 18 | INCLUDE |
| cityGroup | citygroup | Masters / Admin | models/CityGroup.js | business | 0 | 4 | INCLUDE |
| companyLocation | companylocation | Masters / Admin | models/CompanyLocation.js | business | 0 | 12 | INCLUDE |
| contact | contact | Masters / Admin | models/Contact.js | business, contact, contactType, ledger, purchaseTerm, salesTerm, transporter | 0 | 58125 | INCLUDE |
| contactType | contacttype | Masters / Admin | models/ContactType.js | business | 0 | 11 | INCLUDE |
| counter | counter | Masters / Admin | models/Counter.js | — | 0 | 66 | INCLUDE |
| creditNote | creditnote | Sales | models/CreditNote.js | business, companyLocation | 0 | 0 | INCLUDE |
| customer | customer | Sales | models/Customer.js | — | 0 | 0 | INCLUDE |
| debitNote | debitnote | Sales | models/DebitNote.js | agent, business, companyLocation, logistic | 0 | 2 | INCLUDE |
| delivery | delivery | Sales | models/Delivery.js | business, companyLocation, contact, dispatch, supplier, transporter | 1 | 46 | INCLUDE |
| deliveryChallan | deliverychallan | Sales | models/DeliveryChallan.js | agent, business, companyLocation, customer, ledger, logistic, purchaseGroup, stockPoint, stockTransferLocation, stockTransferReceived | 0 | 6 | INCLUDE |
| dispatch | dispatch | Sales | models/Dispatch.js | business, companyLocation, delivery, driver, transportRoute, vehicle | 0 | 2 | INCLUDE |
| docSetup | docsetup | Masters / Admin | models/DocSetup.js | business | 1 | 13 | INCLUDE |
| driver | driver | Masters / Admin | models/Driver.js | business, companyLocation | 0 | 1 | INCLUDE |
| ecommerceProduct | ecommerceproduct | Configuration / Web | models/EcommerceProduct.js | business, item, productClassificationOption | 2 | 8 | INCLUDE |
| ecomSetting | ecomsetting | Configuration / Web | models/EcomSetting.js | business | 0 | 1 | INCLUDE |
| grc | grc | Purchase / GRC | models/Grc.js | agent, business, companyLocation, delivery, logistic, purchaseGroup, purchaseTerm, stockPoint, supplier | 0 | 147 | INCLUDE |
| grt | grt | Purchase / GRC | models/Grt.js | agent, business, companyLocation, logistic, purchaseGroup, purchaseTerm, supplier | 0 | 3 | INCLUDE |
| hsn | hsn | Inventory / Masters | models/Hsn.js | business, tax | 0 | 121 | INCLUDE |
| hsrImportJob | hsrimportjob | Other ERP | models/HsrImportJob.js | business, companyLocation, user | 3 | 0 | INCLUDE |
| icAutoPurchaseReceived | icautopurchasereceived | Inter Company | models/IcAutoPurchaseReceived.js | business, companyLocation, grc, icSalesInvoice | 0 | 3 | INCLUDE |
| icAutoPurchaseReturn | icautopurchasereturn | Inter Company | models/IcAutoPurchaseReturn.js | agent, business, companyLocation, contact, logistic, stockPoint, supplier | 0 | 3 | INCLUDE |
| icDeliveryChallan | icdeliverychallan | Inter Company | models/IcDeliveryChallan.js | business, companyLocation, contact, logistic, stockPoint | 0 | 45 | INCLUDE |
| icItemInvoice | iciteminvoice | Inter Company | models/IcItemInvoice.js | business, companyLocation | 1 | 20 | INCLUDE |
| icPurchaseReceived | icpurchasereceived | Inter Company | models/IcPurchaseReceived.js | business, companyLocation, icItemInvoice | 1 | 9 | INCLUDE |
| icSalesInvoice | icsalesinvoice | Inter Company | models/IcSalesInvoice.js | business, companyLocation, icDeliveryChallan | 0 | 3 | INCLUDE |
| icSalesReturn | icsalesreturn | Inter Company | models/IcSalesReturn.js | business, companyLocation, icAutoPurchaseReturn | 0 | 3 | INCLUDE |
| invoiceLayoutSetting | invoicelayoutsetting | Configuration / Web | models/InvoiceLayoutSetting.js | business, companyLocation | 0 | 3 | INCLUDE |
| item | item | Inventory / Masters | models/Item.js | business, hsn, productFilter, productGroup, uom | 0 | 411 | INCLUDE |
| itemWiseImportJob | itemwiseimportjob | Inventory / Masters | models/ItemWiseImportJob.js | — | 2 | 5 | INCLUDE |
| journalEntry | journalentry | Accounting | models/JournalEntry.js | accountsMaster, business, companyLocation, journalEntry | 4 | 1 | INCLUDE |
| ledger | ledger | Accounting | models/Ledger.js | business, ledgerGroup | 0 | 3 | INCLUDE |
| ledgerGroup | ledgergroup | Accounting | models/LedgerGroup.js | business, ledgerGroup | 0 | 99 | INCLUDE |
| ledgerGroupMapping | ledgergroupmapping | Accounting | models/LedgerGroupMapping.js | business | 0 | 1 | INCLUDE |
| locationSetting | locationsetting | Masters / Admin | models/LocationSetting.js | business, companyLocation | 0 | 1 | INCLUDE |
| loginSecurity | loginsecurity | Masters / Admin | models/LoginSecurity.js | business | 0 | 1 | INCLUDE |
| logistic | logistic | Masters / Admin | models/Logistic.js | business, companyLocation, supplier | 0 | 2 | INCLUDE |
| loyaltyLedger | loyaltyledger | POS | models/LoyaltyLedger.js | business, companyLocation | 1 | 9 | EXCLUDE |
| loyaltyPoint | loyaltypoint | POS | models/LoyaltyPoint.js | business, ledger | 0 | 1 | EXCLUDE |
| paymentMethod | paymentmethod | POS | models/PaymentMethod.js | business, companyLocation, ledger, posCounter | 0 | 0 | EXCLUDE |
| pincode | pincode | Masters / Admin | app/api/pincode/route.js | — | 0 | 25 | INCLUDE |
| posCounter | poscounter | POS | models/PosCounter.js | business, companyLocation | 0 | 4 | EXCLUDE |
| posFooterTemplate | posfootertemplate | POS | models/PosFooterTemplate.js | business | 0 | 0 | EXCLUDE |
| posHold | poshold | POS | models/PosHold.js | business, companyLocation, customer, posCounter | 1 | 0 | EXCLUDE |
| posInvoice | posinvoice | POS | models/PosInvoice.js | business, companyLocation | 4 | 83 | EXCLUDE |
| posReturn | posreturn | POS | models/PosReturn.js | business, companyLocation, posInvoice | 5 | 8 | EXCLUDE |
| posSetting | possetting | POS | models/PosSetting.js | business, companyLocation | 0 | 2 | EXCLUDE |
| productClassificationOption | productclassificationoption | Inventory / Masters | models/ProductClassificationOption.js | business | 2 | 184 | INCLUDE |
| productFilter | productfilter | Inventory / Masters | models/ProductFilter.js | business, productFilter | 0 | 1 | INCLUDE |
| productGroup | productgroup | Inventory / Masters | models/ProductGroup.js | business, productGroup | 0 | 116 | INCLUDE |
| ProductImage | productImage | Barcode | models/ProductImage.js | — | 0 | 10 | INCLUDE |
| purchaseCharge | purchasecharge | Purchase / GRC | models/PurchaseCharge.js | business, ledger | 0 | 7 | INCLUDE |
| purchaseGroup | purchasegroup | Purchase / GRC | models/PurchaseGroup.js | business | 0 | 21 | INCLUDE |
| purchaseInvoice | purchaseinvoice | Purchase / GRC | models/PurchaseInvoice.js | agent, business, companyLocation, contact, logistic, purchaseGroup, purchaseTerm, supplier | 0 | 28 | INCLUDE |
| purchaseRateCode | purchaseratecode | Purchase / GRC | models/PurchaseRateCode.js | business, companyLocation | 0 | 1 | INCLUDE |
| purchaseTerm | purchaseterm | Purchase / GRC | models/PurchaseTerm.js | business | 0 | 7 | INCLUDE |
| role | role | Masters / Admin | models/Role.js | business | 1 | 4 | INCLUDE |
| rolePermission | rolepermission | Masters / Admin | models/RolePermission.js | business | 1 | 7 | INCLUDE |
| salesInvoice | salesinvoice | Sales | models/SalesInvoice.js | business, companyLocation, customer | 4 | 1 | INCLUDE |
| salesPerson | salesperson | Sales | models/SalesPerson.js | business | 0 | 5 | INCLUDE |
| salesReturn | salesreturn | Sales | models/SalesReturn.js | business, companyLocation, customer | 2 | 1 | INCLUDE |
| salesTerm | salesterm | Sales | models/SalesTerm.js | business | 0 | 0 | INCLUDE |
| splitBarcodeSetting | splitbarcodesetting | Barcode | models/SplitBarcodeSetting.js | business | 0 | 2 | INCLUDE |
| stockAdjustment | stockadjustment | Inventory / Masters | models/StockAdjustment.js | business, companyLocation, stockPoint | 0 | 79 | INCLUDE |
| stockMovement | stockmovement | Inventory / Masters | models/StockMovement.js | business, companyLocation, item | 4 | 43641 | INCLUDE |
| stockPoint | stockpoint | Inventory / Masters | models/StockPoint.js | business, companyLocation, stockPoint | 0 | 8 | INCLUDE |
| stockTransfer | stocktransfer | Inventory / Masters | models/StockTransfer.js | business, companyLocation, item, stockPoint | 5 | 0 | INCLUDE |
| stockTransferLocation | stocktransferlocation | Inventory / Masters | models/StockTransferLocation.js | business, companyLocation, stockPoint, stockTransferPacket | 0 | 3 | INCLUDE |
| stockTransferPacket | stocktransferpacket | Inventory / Masters | models/StockTransferPacket.js | business, companyLocation, stockPoint | 0 | 3 | INCLUDE |
| stockTransferReceived | stocktransferreceived | Inventory / Masters | models/StockTransferReceived.js | business, companyLocation, stockPoint, stockTransferLocation | 0 | 3 | INCLUDE |
| storeDebitNote | storedebitnote | Inter Store Sell | models/StoreDebitNote.js | business, companyLocation, storeSalesInvoice | 1 | 0 | INCLUDE |
| storeDeliveryChallan | storedeliverychallan | Inter Store Sell | models/StoreDeliveryChallan.js | business, companyLocation, stockPoint, storeSalesInvoice | 1 | 2 | INCLUDE |
| storeSalesInvoice | storesalesinvoice | Inter Store Sell | models/StoreSalesInvoice.js | business, companyLocation | 1 | 0 | INCLUDE |
| storeSalesReturn | storesalesreturn | Inter Store Sell | models/StoreSalesReturn.js | business, companyLocation, storeSalesInvoice | 1 | 0 | INCLUDE |
| supplier | supplier | Purchase / GRC | models/Supplier.js | — | 1 | 801 | INCLUDE |
| tax | tax | Inventory / Masters | models/Tax.js | business, ledger | 0 | 15 | INCLUDE |
| transferLock | transferlock | Inventory / Masters | models/TransferLock.js | business | 1 | 0 | INCLUDE |
| transporter | transporter | Masters / Admin | models/Transporter.js | business, companyLocation | 0 | 17 | INCLUDE |
| transportRoute | transportroute | Masters / Admin | models/TransportRoute.js | business, companyLocation | 0 | 1 | INCLUDE |
| uom | uom | Inventory / Masters | models/Uom.js | business | 0 | 15 | INCLUDE |
| user | user | Masters / Admin | models/User.js | business, companyLocation, posCounter | 0 | 10 | INCLUDE |
| vehicle | vehicle | Masters / Admin | models/Vehicle.js | business, companyLocation | 0 | 2 | INCLUDE |
| voucher | voucher | Accounting | models/Voucher.js | business, companyLocation, ledger | 1 | 3 | INCLUDE |
| voucherSetting | vouchersetting | Accounting | models/VoucherSetting.js | business | 0 | 0 | INCLUDE |
| WebsiteEvent | websiteevents | Configuration / Web | models/WebsiteEvent.js | — | 4 | 0 | INCLUDE |

## D. Legacy / unreferenced source collections

These collections exist in the source database but have no current Mongoose model in this repository. They are included by default because the task allows only the two exclusion categories and asks for all remaining ERP data to be preserved. They are flagged here so they can be reviewed separately; they are **not** silently dropped.

| Collection | Source docs | Status | Reason |
| --- | --- | --- | --- |
| adminusers | 2 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| attributedefinitions | 12 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| auditlogs | 36 | INCLUDE | Shared audit log; may contain POS actions but is not POS-owned. |
| auditLogs | 24 | INCLUDE | Legacy shared audit log. |
| banners | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| branches | 4 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| carts | 9 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| categories | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| category | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| collections | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| couponredemptions | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| coupons | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| customers | 10 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceProduct | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceproducts | 15653 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecommerceProducts | 23962 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ecomproduct | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| erpSyncErrors | 230 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| erpSyncRuns | 24 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| goodsReceived | 9 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| goodstype | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| groups | 20 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| groupsessions | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| icreversedeliverychallan | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| invoiceshare | 1 | EXCLUDE | Shared POS invoice PDF links; created only from app/api/invoice-share for posinvoice rows. |
| items | 18790 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| ledgersetting | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| loyaltytransaction | 9 | EXCLUDE | Legacy POS loyalty movement collection (same data shape as loyaltyledger). |
| orders | 21 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| procurementtype | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| producttypes | 16 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| purchasesetting | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| salescharge | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| schemamigration | 1 | INCLUDE | Migration bookkeeping, shared. |
| sitesettings | 1 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storefrontGroups | 17 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| storefrontSettings | 2 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| subgroups | 31 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| synclogs | 73 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| visits | 304 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| websiteevent | 0 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |
| wishlists | 10 | INCLUDE | Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data. |

## E. Shared collections deliberately NOT excluded

| Collection | Reason |
| --- | --- |
| counter | Atomic sequence generator shared by POS and every other document series; contains no POS transaction. |
| docsetup | Document-number setup shared by all modules. |
| role | Role master shared by the whole application. |
| rolepermission | Permission matrix shared by the whole application (includes POS screens). |
| user | User accounts shared by the whole application (cashier counterId is one field). |
| loginsecurity | Login/security records shared by all users. |
| invoicelayoutsetting | Invoice layout configuration; a setting, not a POS transaction. |
| salesperson | Staff master used by sales screens and POS; not a POS transaction. |
| auditlogs | Shared audit log; may contain POS actions but is not POS-owned. |
| auditLogs | Legacy shared audit log. |
| schemamigration | Migration bookkeeping, shared. |

## F. Safety facts at audit time

| Check | Result |
| --- | --- |
| Source connection | PASS |
| Target connection (directConnection) | PASS |
| Source database | test |
| Target database | grooretailerp1 |
| Target collections at audit time | 128 |
| Target documents at audit time | 163603 |
| Target data state | NON-EMPTY — 128 collections / 163603 documents; existing _ids are never overwritten and conflicts abort a run |
| Source collections | 141 |
| Model collections absent from source | none |
| Target-only collections | none |
| Indexes on included collections | 636 |
| Unique indexes on included collections | 42 |

## G. Index inventory

| Collection | Indexes (source) | Unique | Notes |
| --- | --- | --- | --- |
| accountingsettings | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>accounting_settings_per_scope: {"businessId":1,"locationId":1} | accounting_settings_per_scope |  |
| accountsmaster | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>parentAccountId_1: {"parentAccountId":1}<br>account_code_per_scope: {"businessId":1,"locationId":1,"accountCode":1}<br>businessId_1_locationId_1_accountType_1_accountName_1: {"businessId":1,"locationId":1,"accountType":1,"accountName":1}<br>businessId_1_locationId_1_isActive_1: {"businessId":1,"locationId":1,"isActive":1} | account_code_per_scope |  |
| adminusers | _id_: {"_id":1}<br>email_1: {"email":1} | email_1 |  |
| agent | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>contactId_1: {"contactId":1} | — |  |
| attributeaddon | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| attributedefinitions | _id_: {"_id":1}<br>key_1: {"key":1} | key_1 |  |
| auditlogs | _id_: {"_id":1}<br>actor_1: {"actor":1}<br>action_1: {"action":1}<br>entity_1: {"entity":1}<br>entityId_1: {"entityId":1}<br>createdAt_-1: {"createdAt":-1} | — |  |
| auditLogs | _id_: {"_id":1} | — |  |
| b2binvoice | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1} | — |  |
| banners | _id_: {"_id":1}<br>placement_1: {"placement":1} | — |  |
| barcodeitem | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>grcId_1: {"grcId":1}<br>grcNo_1: {"grcNo":1}<br>barcodeLabelId_1: {"barcodeLabelId":1}<br>barcodeNo_1: {"barcodeNo":1}<br>itemId_1: {"itemId":1}<br>itemCode_1: {"itemCode":1}<br>groupId_1: {"groupId":1}<br>subGroupId_1: {"subGroupId":1}<br>supplierId_1: {"supplierId":1} | — |  |
| barcodelabelsetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| barcodeprintbatch | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| barcodesetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>businessId_1_finYear_1_subType_1_periodIndex_1: {"businessId":1,"finYear":1,"subType":1,"periodIndex":1} | — |  |
| branches | _id_: {"_id":1}<br>branchCode_1: {"branchCode":1}<br>gstNumber_1: {"gstNumber":1}<br>status_1: {"status":1}<br>lifecycleStage_1: {"lifecycleStage":1}<br>isDeleted_1: {"isDeleted":1}<br>branchName_text_branchCode_text: {"_fts":"text","_ftsx":1}<br>erpBusinessId_1: {"erpBusinessId":1} | branchCode_1 |  |
| business | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>isMainBranch_1: {"isMainBranch":1}<br>parentBusinessId_1: {"parentBusinessId":1} | — |  |
| businesscontact | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| carts | _id_: {"_id":1}<br>customer_1: {"customer":1}<br>groupKey_1: {"groupKey":1} | customer_1 |  |
| catalogs | _id_: {"_id":1}<br>catalog_1: {"catalog":1} | — |  |
| categories | _id_: {"_id":1}<br>slug_1: {"slug":1}<br>parent_1: {"parent":1}<br>path_1: {"path":1}<br>status_1: {"status":1}<br>status_1_showInHeader_1_displayOrder_1: {"status":1,"showInHeader":1,"displayOrder":1} | slug_1 |  |
| category | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| cities | _id_: {"_id":1} | — |  |
| citygroup | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| collections | _id_: {"_id":1}<br>slug_1: {"slug":1}<br>status_1: {"status":1}<br>status_1_showOnHomepage_1_displayOrder_1: {"status":1,"showOnHomepage":1,"displayOrder":1} | slug_1 |  |
| companylocation | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>isMediator_1: {"isMediator":1} | — |  |
| contact | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>contactKind_1: {"contactKind":1}<br>contactId_1: {"contactId":1}<br>locationId_1: {"locationId":1}<br>supplier_gstNo_unique: {"businessId":1,"gstNo":1} | supplier_gstNo_unique |  |
| contacttype | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| counter | _id_: {"_id":1}<br>key_1: {"key":1} | key_1 |  |
| couponredemptions | _id_: {"_id":1}<br>coupon_1: {"coupon":1}<br>customer_1: {"customer":1}<br>coupon_1_order_1: {"coupon":1,"order":1}<br>coupon_1_customer_1: {"coupon":1,"customer":1} | coupon_1_order_1 |  |
| coupons | _id_: {"_id":1}<br>code_1: {"code":1}<br>status_1: {"status":1}<br>isDeleted_1: {"isDeleted":1}<br>status_1_validTo_1: {"status":1,"validTo":1} | code_1 |  |
| creditnote | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1} | — |  |
| customer | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>contactId_1: {"contactId":1} | — |  |
| customers | _id_: {"_id":1}<br>email_1: {"email":1}<br>googleId_1: {"googleId":1}<br>status_1: {"status":1}<br>isDeleted_1: {"isDeleted":1}<br>name_text_email_text_phone_text: {"_fts":"text","_ftsx":1} | email_1 |  |
| debitnote | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1} | — |  |
| delivery | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>transactionNo_1: {"transactionNo":1}<br>transporterId_1: {"transporterId":1}<br>dispatchId_1: {"dispatchId":1}<br>businessId_1_locationId_1_finYear_1_transactionNo_1: {"businessId":1,"locationId":1,"finYear":1,"transactionNo":1} | businessId_1_locationId_1_finYear_1_transactionNo_1 |  |
| deliverychallan | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>salesInvoiceId_1: {"salesInvoiceId":1}<br>stockTransferLocationId_1: {"stockTransferLocationId":1}<br>stockTransferReceivedId_1: {"stockTransferReceivedId":1} | — |  |
| dispatch | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>docNo_1: {"docNo":1} | — |  |
| docsetup | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>businessId_1_documentType_1_finYear_1: {"businessId":1,"documentType":1,"finYear":1} | businessId_1_documentType_1_finYear_1 |  |
| driver | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| ecommerceproduct | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>itemId_1: {"itemId":1}<br>ecommItemCode_1: {"ecommItemCode":1}<br>status_1: {"status":1}<br>isPublished_1: {"isPublished":1}<br>businessId_1_slug_1: {"businessId":1,"slug":1} | — |  |
| ecommerceProduct | _id_: {"_id":1}<br>itemId_1: {"itemId":1}<br>status_1: {"status":1} | itemId_1 |  |
| ecommerceproducts | _id_: {"_id":1}<br>erpRef.barcode_1: {"erpRef.barcode":1}<br>erpRef.barcodeLabelId_1: {"erpRef.barcodeLabelId":1}<br>seo.slug_1: {"seo.slug":1}<br>erpRef.itemCode_1: {"erpRef.itemCode":1}<br>publishing.status_1_erpSnapshot.sellable_1_erpSnapshot.sellingPrice_1: {"publishing.status":1,"erpSnapshot.sellable":1,"erpSnapshot.sellingPrice":1}<br>publishing.status_1_merchandising.categoryIds_1: {"publishing.status":1,"merchandising.categoryIds":1}<br>publishing.status_1_merchandising.collectionIds_1: {"publishing.status":1,"merchandising.collectionIds":1}<br>publishing.status_1_merchandising.featured_1_merchandising.displayOrder_1: {"publishing.status":1,"merchandising.featured":1,"merchandising.displayOrder":1}<br>publishing.status_1_publishing.publishedAt_-1: {"publishing.status":1,"publishing.publishedAt":-1}<br>sync.status_1: {"sync.status":1}<br>legacyItemId_1: {"legacyItemId":1}<br>stats.soldQty_-1: {"stats.soldQty":-1}<br>product_text: {"_fts":"text","_ftsx":1} | erpRef.barcode_1, erpRef.barcodeLabelId_1, seo.slug_1 |  |
| ecommerceProducts | _id_: {"_id":1} | — |  |
| ecomproduct | _id_: {"_id":1}<br>itemId_1: {"itemId":1}<br>businessId_1: {"businessId":1}<br>businessId_1_status_1: {"businessId":1,"status":1}<br>isActive_1_isExternalSynced_1: {"isActive":1,"isExternalSynced":1}<br>erpProductId_1: {"erpProductId":1}<br>status_1: {"status":1} | itemId_1, erpProductId_1 |  |
| ecomsetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| erpSyncErrors | _id_: {"_id":1} | — |  |
| erpSyncRuns | _id_: {"_id":1} | — |  |
| goodsReceived | _id_: {"_id":1} | — |  |
| goodstype | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| grc | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>lrTransactionId_1: {"lrTransactionId":1}<br>purchaseInvoiceId_1: {"purchaseInvoiceId":1}<br>accountingStatus_1: {"accountingStatus":1} | — |  |
| groups | _id_: {"_id":1}<br>branch_1: {"branch":1}<br>status_1: {"status":1}<br>lifecycleStage_1: {"lifecycleStage":1}<br>isDeleted_1: {"isDeleted":1}<br>branch_1_groupCode_1: {"branch":1,"groupCode":1}<br>groupName_text_groupCode_text: {"_fts":"text","_ftsx":1}<br>erpProductGroup_1: {"erpProductGroup":1} | branch_1_groupCode_1 |  |
| groupsessions | _id_: {"_id":1}<br>key_1: {"key":1}<br>branch_1: {"branch":1}<br>createdBy_1: {"createdBy":1}<br>status_1: {"status":1}<br>expiresAt_1: {"expiresAt":1} | key_1 |  |
| grt | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>debitNoteId_1: {"debitNoteId":1} | — |  |
| hsn | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| hsrimportjob | _id_: {"_id":1}<br>jobId_1: {"jobId":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>operation_1: {"operation":1}<br>status_1: {"status":1}<br>businessId_1_status_1_createdAt_-1: {"businessId":1,"status":1,"createdAt":-1}<br>locationId_1_status_1_createdAt_-1: {"locationId":1,"status":1,"createdAt":-1}<br>operation_1_status_1_createdAt_-1: {"operation":1,"status":1,"createdAt":-1} | jobId_1 |  |
| icautopurchasereceived | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>recNo_1: {"recNo":1}<br>icSalesInvoiceId_1: {"icSalesInvoiceId":1}<br>fromBusinessId_1: {"fromBusinessId":1} | — |  |
| icautopurchasereturn | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toBusinessId_1: {"toBusinessId":1}<br>returnNo_1: {"returnNo":1}<br>icSalesReturnId_1: {"icSalesReturnId":1}<br>viaBusinessId_1: {"viaBusinessId":1} | — |  |
| icdeliverychallan | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toBusinessId_1: {"toBusinessId":1}<br>dcNo_1: {"dcNo":1}<br>icSalesInvoiceId_1: {"icSalesInvoiceId":1}<br>viaBusinessId_1: {"viaBusinessId":1}<br>receivedAt_1: {"receivedAt":1} | — |  |
| iciteminvoice | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toBusinessId_1: {"toBusinessId":1}<br>invoiceNo_1: {"invoiceNo":1}<br>businessId_1_createdAt_-1: {"businessId":1,"createdAt":-1} | — |  |
| icpurchasereceived | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>icItemInvoiceId_1: {"icItemInvoiceId":1}<br>businessId_1_createdAt_-1: {"businessId":1,"createdAt":-1} | icItemInvoiceId_1 |  |
| icreversedeliverychallan | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toBusinessId_1: {"toBusinessId":1}<br>rdcNo_1: {"rdcNo":1} | — |  |
| icsalesinvoice | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toBusinessId_1: {"toBusinessId":1}<br>toLocationId_1: {"toLocationId":1}<br>invoiceNo_1: {"invoiceNo":1}<br>receivedId_1: {"receivedId":1} | — |  |
| icsalesreturn | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>returnCode_1: {"returnCode":1}<br>icAutoPurchaseReturnId_1: {"icAutoPurchaseReturnId":1}<br>fromBusinessId_1: {"fromBusinessId":1} | — |  |
| invoicelayoutsetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| item | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>subGroupId_1: {"subGroupId":1}<br>slug_1: {"slug":1}<br>isFeatured_1: {"isFeatured":1}<br>isNewArrival_1: {"isNewArrival":1}<br>isActive_1: {"isActive":1} | — |  |
| items | _id_: {"_id":1}<br>branch_1: {"branch":1}<br>group_1: {"group":1}<br>subgroup_1: {"subgroup":1}<br>status_1: {"status":1}<br>lifecycleStage_1: {"lifecycleStage":1}<br>isDeleted_1: {"isDeleted":1}<br>identity.productName_text_identity.itemCode_text_identity.sku_text_identity.barcode_text: {"_fts":"text","_ftsx":1}<br>ecommerceStatus_1: {"ecommerceStatus":1} | — |  |
| itemwiseimportjob | _id_: {"_id":1}<br>jobId_1: {"jobId":1}<br>businessId_1: {"businessId":1}<br>fileHash_1: {"fileHash":1}<br>status_1: {"status":1}<br>businessId_1_status_1_createdAt_-1: {"businessId":1,"status":1,"createdAt":-1}<br>businessId_1_fileHash_1_status_1: {"businessId":1,"fileHash":1,"status":1} | jobId_1 |  |
| journalentry | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>businessId_1_locationId_1_finYear_1_journalDate_-1: {"businessId":1,"locationId":1,"finYear":1,"journalDate":-1}<br>lines.accountId_1_journalDate_1: {"lines.accountId":1,"journalDate":1}<br>businessId_1_referenceNo_1: {"businessId":1,"referenceNo":1}<br>journal_source_idempotency: {"businessId":1,"source":1,"sourceRefId":1,"kind":1,"postingSeq":1} | journal_source_idempotency |  |
| ledger | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| ledgergroup | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| ledgergroupmapping | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| ledgersetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| locationsetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| loginsecurity | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| logistic | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| orders | _id_: {"_id":1}<br>orderNumber_1: {"orderNumber":1}<br>customer_1: {"customer":1}<br>branch_1: {"branch":1}<br>payment.razorpayOrderId_1: {"payment.razorpayOrderId":1}<br>status_1: {"status":1}<br>invoiceNumber_1: {"invoiceNumber":1}<br>groupKey_1: {"groupKey":1}<br>customer_1_createdAt_-1: {"customer":1,"createdAt":-1}<br>sourceBranches.branch_1_createdAt_-1: {"sourceBranches.branch":1,"createdAt":-1}<br>orderNumber_text_customerEmail_text_customerPhone_text: {"_fts":"text","_ftsx":1}<br>erpSync.status_1: {"erpSync.status":1} | orderNumber_1 |  |
| pincode | _id_: {"_id":1}<br>pin_1: {"pin":1} | pin_1 |  |
| procurementtype | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| productclassificationoption | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>type_1: {"type":1}<br>businessId_1_type_1_name_1: {"businessId":1,"type":1,"name":1}<br>businessId_1_type_1_isActive_1: {"businessId":1,"type":1,"isActive":1} | businessId_1_type_1_name_1 |  |
| productfilter | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| productgroup | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>parentId_1: {"parentId":1} | — |  |
| productImage | _id_: {"_id":1}<br>barcodeGenerated_1: {"barcodeGenerated":1} | — |  |
| producttypes | _id_: {"_id":1} | — |  |
| purchasecharge | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| purchasegroup | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| purchaseinvoice | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1} | — |  |
| purchaseratecode | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| purchasesetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| purchaseterm | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| role | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>businessId_1_name_1: {"businessId":1,"name":1} | businessId_1_name_1 |  |
| rolepermission | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>role_1: {"role":1}<br>businessId_1_role_1: {"businessId":1,"role":1} | businessId_1_role_1 |  |
| salescharge | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| salesinvoice | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>businessId_1_createdAt_1: {"businessId":1,"createdAt":1}<br>businessId_1_locationId_1_createdAt_1: {"businessId":1,"locationId":1,"createdAt":1}<br>businessId_1_salesInvoiceNo_1: {"businessId":1,"salesInvoiceNo":1}<br>salesChannel_1: {"salesChannel":1}<br>businessId_1_salesChannel_1_createdAt_1: {"businessId":1,"salesChannel":1,"createdAt":1} | — |  |
| salesperson | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>spCode_1: {"spCode":1} | — |  |
| salesreturn | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>creditNoteId_1: {"creditNoteId":1}<br>businessId_1_returnDate_1: {"businessId":1,"returnDate":1}<br>businessId_1_locationId_1_returnDate_1: {"businessId":1,"locationId":1,"returnDate":1}<br>salesChannel_1: {"salesChannel":1} | — |  |
| salesterm | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| schemamigration | _id_: {"_id":1} | — |  |
| sitesettings | _id_: {"_id":1}<br>key_1: {"key":1} | key_1 |  |
| splitbarcodesetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1} | — |  |
| stockadjustment | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>adjustmentNo_1: {"adjustmentNo":1} | — |  |
| stockmovement | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>finYear_1: {"finYear":1}<br>type_1: {"type":1}<br>barcodeId_1: {"barcodeId":1}<br>barcodeNo_1: {"barcodeNo":1}<br>itemCode_1: {"itemCode":1}<br>fromLocationId_1: {"fromLocationId":1}<br>toLocationId_1: {"toLocationId":1}<br>refId_1: {"refId":1}<br>refNo_1: {"refNo":1}<br>at_1: {"at":1}<br>businessId_1_at_-1: {"businessId":1,"at":-1}<br>barcodeNo_1_at_1: {"barcodeNo":1,"at":1}<br>businessId_1_type_1_at_-1: {"businessId":1,"type":1,"at":-1}<br>refModel_1_refId_1: {"refModel":1,"refId":1}<br>derived_1: {"derived":1} | — |  |
| stockpoint | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| stocktransfer | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>finYear_1: {"finYear":1}<br>transferNo_1: {"transferNo":1}<br>transferDate_1: {"transferDate":1}<br>fromLocationId_1: {"fromLocationId":1}<br>toLocationId_1: {"toLocationId":1}<br>status_1: {"status":1}<br>businessId_1_toLocationId_1_status_1: {"businessId":1,"toLocationId":1,"status":1}<br>businessId_1_fromLocationId_1_status_1: {"businessId":1,"fromLocationId":1,"status":1}<br>businessId_1_transferDate_-1: {"businessId":1,"transferDate":-1}<br>lines.barcodeNo_1: {"lines.barcodeNo":1} | — |  |
| stocktransferlocation | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>transferFromLocationId_1: {"transferFromLocationId":1}<br>transferToLocationId_1: {"transferToLocationId":1}<br>locationNo_1: {"locationNo":1}<br>packetNo_1: {"packetNo":1}<br>fromLocationId_1: {"fromLocationId":1}<br>toLocationId_1: {"toLocationId":1}<br>receivedId_1: {"receivedId":1} | — |  |
| stocktransferpacket | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>transferFromLocationId_1: {"transferFromLocationId":1}<br>transferToLocationId_1: {"transferToLocationId":1}<br>packetNo_1: {"packetNo":1}<br>fromLocationId_1: {"fromLocationId":1}<br>toLocationId_1: {"toLocationId":1}<br>stockTransferLocationId_1: {"stockTransferLocationId":1} | — |  |
| stocktransferreceived | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>packetId_1: {"packetId":1}<br>locationIdFrom_1: {"locationIdFrom":1}<br>locationIdTo_1: {"locationIdTo":1}<br>receivedNo_1: {"receivedNo":1}<br>strCode_1: {"strCode":1}<br>stockTransferLocationId_1: {"stockTransferLocationId":1}<br>fromLocationId_1: {"fromLocationId":1} | — |  |
| storedebitnote | _id_: {"_id":1}<br>module_1: {"module":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>fromLocationId_1: {"fromLocationId":1}<br>debitNoteNo_1: {"debitNoteNo":1}<br>salesInvoiceId_1: {"salesInvoiceId":1}<br>status_1: {"status":1}<br>businessId_1_debitNoteDate_1: {"businessId":1,"debitNoteDate":1} | — |  |
| storedeliverychallan | _id_: {"_id":1}<br>module_1: {"module":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toLocationId_1: {"toLocationId":1}<br>dcNo_1: {"dcNo":1}<br>status_1: {"status":1}<br>receivedAt_1: {"receivedAt":1}<br>salesInvoiceId_1: {"salesInvoiceId":1}<br>businessId_1_locationId_1_dcDate_1: {"businessId":1,"locationId":1,"dcDate":1} | — |  |
| storefrontGroups | _id_: {"_id":1}<br>productGroup_1: {"productGroup":1}<br>isPublished_1: {"isPublished":1} | productGroup_1 |  |
| storefrontSettings | _id_: {"_id":1} | — |  |
| storesalesinvoice | _id_: {"_id":1}<br>module_1: {"module":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>toLocationId_1: {"toLocationId":1}<br>invoiceNo_1: {"invoiceNo":1}<br>deliveryChallanIds_1: {"deliveryChallanIds":1}<br>status_1: {"status":1}<br>businessId_1_invoiceDate_1: {"businessId":1,"invoiceDate":1} | — |  |
| storesalesreturn | _id_: {"_id":1}<br>module_1: {"module":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>fromLocationId_1: {"fromLocationId":1}<br>returnNo_1: {"returnNo":1}<br>salesInvoiceId_1: {"salesInvoiceId":1}<br>status_1: {"status":1}<br>businessId_1_returnDate_1: {"businessId":1,"returnDate":1} | — |  |
| subgroups | _id_: {"_id":1}<br>branch_1: {"branch":1}<br>group_1: {"group":1}<br>status_1: {"status":1}<br>lifecycleStage_1: {"lifecycleStage":1}<br>isDeleted_1: {"isDeleted":1}<br>group_1_subgroupCode_1: {"group":1,"subgroupCode":1}<br>subgroupName_text_subgroupCode_text: {"_fts":"text","_ftsx":1}<br>erpItem_1: {"erpItem":1}<br>erpProductGroup_1: {"erpProductGroup":1} | group_1_subgroupCode_1 |  |
| supplier | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>contactId_1: {"contactId":1}<br>supplier_gstNo_unique: {"businessId":1,"gstNo":1} | supplier_gstNo_unique |  |
| synclogs | _id_: {"_id":1}<br>status_1: {"status":1}<br>createdAt_-1: {"createdAt":-1} | — |  |
| tax | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| transferlock | _id_: {"_id":1}<br>pair_1: {"pair":1}<br>expiresAt_1: {"expiresAt":1} | pair_1 |  |
| transporter | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>transporterCode_1: {"transporterCode":1} | — |  |
| transportroute | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| uom | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| user | _id_: {"_id":1}<br>email_1: {"email":1}<br>businessId_1: {"businessId":1} | — |  |
| vehicle | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| visits | _id_: {"_id":1}<br>day_1: {"day":1}<br>branch_1: {"branch":1}<br>day_1_branch_1_pageType_1: {"day":1,"branch":1,"pageType":1} | day_1_branch_1_pageType_1 |  |
| voucher | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>finYear_1: {"finYear":1}<br>type_1: {"type":1}<br>voucherNo_1: {"voucherNo":1}<br>partyLedgerId_1: {"partyLedgerId":1}<br>businessId_1_finYear_1_type_1_voucherDate_-1: {"businessId":1,"finYear":1,"type":1,"voucherDate":-1} | — |  |
| vouchersetting | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1} | — |  |
| websiteevent | _id_: {"_id":1}<br>businessId_1: {"businessId":1}<br>locationId_1: {"locationId":1}<br>type_1: {"type":1}<br>sessionId_1: {"sessionId":1}<br>visitorId_1: {"visitorId":1}<br>isBot_1: {"isBot":1}<br>businessId_1_occurredAt_-1: {"businessId":1,"occurredAt":-1}<br>businessId_1_type_1_occurredAt_-1: {"businessId":1,"type":1,"occurredAt":-1}<br>sessionId_1_occurredAt_1: {"sessionId":1,"occurredAt":1}<br>visitorId_1_occurredAt_1: {"visitorId":1,"occurredAt":1}<br>eventId_1: {"eventId":1}<br>dedupeKey_1: {"dedupeKey":1}<br>occurredAt_1: {"occurredAt":1} | eventId_1, dedupeKey_1 |  |
| websiteevents | _id_: {"_id":1}<br>dedupeKey_1: {"dedupeKey":1}<br>ts_-1: {"ts":-1}<br>visitorId_1_ts_-1: {"visitorId":1,"ts":-1}<br>event_1_ts_-1: {"event":1,"ts":-1}<br>sessionId_1: {"sessionId":1} | dedupeKey_1 |  |
| wishlists | _id_: {"_id":1}<br>customer_1: {"customer":1} | customer_1 |  |

## H. Model collections absent from source

None.

## Execution gates

1. `barcodeLabel` decision: **EXCLUDE**, confirmed by the project owner.
2. Pre-flight backup/duplicate-index check: complete.
3. Initial migration: complete; see the checkpoint status above.
4. Incremental refresh after new source rows: `node --env-file=.env scripts/migration/migrate.mjs --apply --yes --exclude-barcode-label --allow-nonempty-target --sync`.
5. Verification and reports: `node --env-file=.env scripts/migration/verify.mjs`.
