# MongoDB Migration Results

Generated: 2026-11-06T06:47:48.416Z

**Overall status: PASS_WITH_WARNINGS**

## Scope

| Item | Value |
| --- | --- |
| Source database | `test` at cluster0.dagaqhc.mongodb.net |
| Target database | `grooretailerp1` at 69.197.176.100:27017 |
| Source collections discovered | 141 |
| Target collections after migration | 128 |
| Included collections | 128 |
| Excluded source collections | 13 |
| Excluded collection isolation checks | 14 |
| Total source documents (included) | 163603 |
| Documents inserted by initial migration | 163603 |
| Documents already present at initial migration | 0 |
| Total failed documents | 0 |
| Total verified documents | 163603 |
| Missing documents | 0 |
| Extra target documents | 0 |
| Mismatched documents | 0 |
| Migration duration | 1000s |
| Last sync | complete at 2026-11-06T06:18:06.910Z; scanned 163603, inserted 0, existing 163603, duration 709s |

## Approved exclusion decision

- **barcodeLabel: EXCLUDE** — 23580 source documents were not migrated.
- POS collections excluded: `posinvoice`, `posreturn`, `poshold`, `possetting`, `poscounter`, `posfootertemplate`, `posinvoicearchive`, `cashregister`, `paymentmethod`, `loyaltypoint`, `loyaltyledger`, `loyaltytransaction`, `invoiceshare`.

The barcode stock collection is the collection named `barcodeLabel` in `lib/barcodeLabel.js`. Because the project owner chose strict exclusion, barcode stock, barcode identifiers and barcode history are **not** in the target. Barcode search, barcode generation, GRC barcode printing, barcode-based stock reports and any barcode lookup will not return migrated units until that collection is migrated or rebuilt. This is an accepted consequence of the decision, not a verification failure.

## Collection verification

| Collection | Source | Target | Difference | Verified | Mismatch | Source only | Target only | Indexes | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| accountingsettings | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 4/4 | PASS |
| accountsmaster | 50 | 50 | 0 | 50 | 0 | 0 | 0 | 7/7 | PASS |
| adminusers | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 2/2 | PASS |
| agent | 8 | 8 | 0 | 8 | 0 | 0 | 0 | 3/3 | PASS |
| attributeaddon | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 3/3 | PASS |
| attributedefinitions | 12 | 12 | 0 | 12 | 0 | 0 | 0 | 2/2 | PASS |
| auditlogs | 36 | 36 | 0 | 36 | 0 | 0 | 0 | 6/6 | PASS |
| auditLogs | 24 | 24 | 0 | 24 | 0 | 0 | 0 | 1/1 | PASS |
| b2binvoice | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4/4 | PASS |
| banners | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2/2 | PASS |
| barcodeitem | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12/12 | PASS |
| barcodelabelsetting | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 3/3 | PASS |
| barcodeprintbatch | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| barcodesetting | 18 | 18 | 0 | 18 | 0 | 0 | 0 | 5/5 | PASS |
| branches | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 8/8 | PASS |
| business | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 5/5 | PASS |
| businesscontact | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| carts | 9 | 9 | 0 | 9 | 0 | 0 | 0 | 3/3 | PASS |
| catalogs | 24 | 24 | 0 | 24 | 0 | 0 | 0 | 2/2 | PASS |
| categories | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6/6 | PASS |
| category | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| cities | 18 | 18 | 0 | 18 | 0 | 0 | 0 | 1/1 | PASS |
| citygroup | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 3/3 | PASS |
| collections | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4/4 | PASS |
| companylocation | 12 | 12 | 0 | 12 | 0 | 0 | 0 | 4/4 | PASS |
| contact | 58125 | 58125 | 0 | 58125 | 0 | 0 | 0 | 6/6 | PASS |
| contacttype | 11 | 11 | 0 | 11 | 0 | 0 | 0 | 3/3 | PASS |
| counter | 66 | 66 | 0 | 66 | 0 | 0 | 0 | 2/2 | PASS |
| couponredemptions | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 5/5 | PASS |
| coupons | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 5/5 | PASS |
| creditnote | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4/4 | PASS |
| customer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| customers | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 6/6 | PASS |
| debitnote | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 4/4 | PASS |
| delivery | 46 | 46 | 0 | 46 | 0 | 0 | 0 | 8/8 | PASS |
| deliverychallan | 6 | 6 | 0 | 6 | 0 | 0 | 0 | 7/7 | PASS |
| dispatch | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 5/5 | PASS |
| docsetup | 13 | 13 | 0 | 13 | 0 | 0 | 0 | 5/5 | PASS |
| driver | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| ecommerceproduct | 8 | 8 | 0 | 8 | 0 | 0 | 0 | 7/7 | PASS |
| ecommerceProduct | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| ecommerceproducts | 15653 | 15653 | 0 | 15653 | 0 | 0 | 0 | 14/14 | PASS |
| ecommerceProducts | 23962 | 23962 | 0 | 23962 | 0 | 0 | 0 | 1/1 | PASS |
| ecomproduct | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7/7 | PASS |
| ecomsetting | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| erpSyncErrors | 230 | 230 | 0 | 230 | 0 | 0 | 0 | 1/1 | PASS |
| erpSyncRuns | 24 | 24 | 0 | 24 | 0 | 0 | 0 | 1/1 | PASS |
| goodsReceived | 9 | 9 | 0 | 9 | 0 | 0 | 0 | 1/1 | PASS |
| goodstype | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| grc | 147 | 147 | 0 | 147 | 0 | 0 | 0 | 7/7 | PASS |
| groups | 20 | 20 | 0 | 20 | 0 | 0 | 0 | 8/8 | PASS |
| groupsessions | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 6/6 | PASS |
| grt | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 5/5 | PASS |
| hsn | 121 | 121 | 0 | 121 | 0 | 0 | 0 | 3/3 | PASS |
| hsrimportjob | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9/9 | PASS |
| icautopurchasereceived | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 7/7 | PASS |
| icautopurchasereturn | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 8/8 | PASS |
| icdeliverychallan | 45 | 45 | 0 | 45 | 0 | 0 | 0 | 9/9 | PASS |
| iciteminvoice | 20 | 20 | 0 | 20 | 0 | 0 | 0 | 7/7 | PASS |
| icpurchasereceived | 9 | 9 | 0 | 9 | 0 | 0 | 0 | 5/5 | PASS |
| icreversedeliverychallan | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 6/6 | PASS |
| icsalesinvoice | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 8/8 | PASS |
| icsalesreturn | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 7/7 | PASS |
| invoicelayoutsetting | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 3/3 | PASS |
| item | 411 | 411 | 0 | 411 | 0 | 0 | 0 | 7/7 | PASS |
| items | 18790 | 18790 | 0 | 18790 | 0 | 0 | 0 | 9/9 | PASS |
| itemwiseimportjob | 5 | 5 | 0 | 5 | 0 | 0 | 0 | 7/7 | PASS |
| journalentry | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 7/7 | PASS |
| ledger | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 3/3 | PASS |
| ledgergroup | 99 | 99 | 0 | 99 | 0 | 0 | 0 | 3/3 | PASS |
| ledgergroupmapping | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| ledgersetting | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| locationsetting | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| loginsecurity | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| logistic | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 3/3 | PASS |
| orders | 21 | 21 | 0 | 21 | 0 | 0 | 0 | 12/12 | PASS |
| pincode | 25 | 25 | 0 | 25 | 0 | 0 | 0 | 2/2 | PASS |
| procurementtype | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| productclassificationoption | 184 | 184 | 0 | 184 | 0 | 0 | 0 | 5/5 | PASS |
| productfilter | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| productgroup | 116 | 116 | 0 | 116 | 0 | 0 | 0 | 4/4 | PASS |
| productImage | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 2/2 | PASS |
| producttypes | 16 | 16 | 0 | 16 | 0 | 0 | 0 | 1/1 | PASS |
| purchasecharge | 7 | 7 | 0 | 7 | 0 | 0 | 0 | 3/3 | PASS |
| purchasegroup | 21 | 21 | 0 | 21 | 0 | 0 | 0 | 3/3 | PASS |
| purchaseinvoice | 28 | 28 | 0 | 28 | 0 | 0 | 0 | 4/4 | PASS |
| purchaseratecode | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| purchasesetting | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| purchaseterm | 7 | 7 | 0 | 7 | 0 | 0 | 0 | 3/3 | PASS |
| role | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 3/3 | PASS |
| rolepermission | 7 | 7 | 0 | 7 | 0 | 0 | 0 | 4/4 | PASS |
| salescharge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| salesinvoice | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 9/9 | PASS |
| salesperson | 5 | 5 | 0 | 5 | 0 | 0 | 0 | 3/3 | PASS |
| salesreturn | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 8/8 | PASS |
| salesterm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| schemamigration | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 1/1 | PASS |
| sitesettings | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 2/2 | PASS |
| splitbarcodesetting | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 4/4 | PASS |
| stockadjustment | 79 | 79 | 0 | 79 | 0 | 0 | 0 | 5/5 | PASS |
| stockmovement | 43641 | 43641 | 0 | 43641 | 0 | 0 | 0 | 17/17 | PASS |
| stockpoint | 8 | 8 | 0 | 8 | 0 | 0 | 0 | 3/3 | PASS |
| stocktransfer | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12/12 | PASS |
| stocktransferlocation | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 11/11 | PASS |
| stocktransferpacket | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 10/10 | PASS |
| stocktransferreceived | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 11/11 | PASS |
| storedebitnote | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10/10 | PASS |
| storedeliverychallan | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 11/11 | PASS |
| storefrontGroups | 17 | 17 | 0 | 17 | 0 | 0 | 0 | 3/3 | PASS |
| storefrontSettings | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 1/1 | PASS |
| storesalesinvoice | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10/10 | PASS |
| storesalesreturn | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10/10 | PASS |
| subgroups | 31 | 31 | 0 | 31 | 0 | 0 | 0 | 10/10 | PASS |
| supplier | 801 | 801 | 0 | 801 | 0 | 0 | 0 | 4/4 | PASS |
| synclogs | 73 | 73 | 0 | 73 | 0 | 0 | 0 | 3/3 | PASS |
| tax | 15 | 15 | 0 | 15 | 0 | 0 | 0 | 3/3 | PASS |
| transferlock | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| transporter | 17 | 17 | 0 | 17 | 0 | 0 | 0 | 4/4 | PASS |
| transportroute | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 3/3 | PASS |
| uom | 15 | 15 | 0 | 15 | 0 | 0 | 0 | 3/3 | PASS |
| user | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 3/3 | PASS |
| vehicle | 2 | 2 | 0 | 2 | 0 | 0 | 0 | 3/3 | PASS |
| visits | 304 | 304 | 0 | 304 | 0 | 0 | 0 | 4/4 | PASS |
| voucher | 3 | 3 | 0 | 3 | 0 | 0 | 0 | 8/8 | PASS |
| vouchersetting | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3/3 | PASS |
| websiteevent | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14/14 | PASS |
| websiteevents | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6/6 | PASS |
| wishlists | 10 | 10 | 0 | 10 | 0 | 0 | 0 | 2/2 | PASS |

## Index migration

| Metric | Value |
| --- | --- |
| Indexes expected on included collections | 636 |
| Indexes present in target | 636 |
| Missing indexes | 0 |
| Index conflicts | 0 |
| Extra target indexes | 0 |

All included collections have the same index names, key patterns and options as the source.

## Excluded collection isolation

| Collection | Category | Source docs | Target present | Target docs | Status |
| --- | --- | --- | --- | --- | --- |
| barcodeLabel | BARCODE_LABEL | 23580 | no | 0 | PASS |
| cashregister | POS | 2 | no | 0 | PASS |
| invoiceshare | POS | 1 | no | 0 | PASS |
| loyaltyledger | POS | 9 | no | 0 | PASS |
| loyaltypoint | POS | 1 | no | 0 | PASS |
| loyaltytransaction | POS | 9 | no | 0 | PASS |
| paymentmethod | POS | 0 | no | 0 | PASS |
| poscounter | POS | 4 | no | 0 | PASS |
| posfootertemplate | POS | 0 | no | 0 | PASS |
| poshold | POS | 0 | no | 0 | PASS |
| posinvoice | POS | 83 | no | 0 | PASS |
| posreturn | POS | 8 | no | 0 | PASS |
| possetting | POS | 2 | no | 0 | PASS |
| posinvoicearchive | POS | 0 | no | 0 | PASS |

## Relationship validation

| From collection | Field | Referenced collection | Documents with ref | References checked | Resolved in target | Lost in target | Pre-existing dangling | Source-resolvable but excluded | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| accountingsettings | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| accountingsettings | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| accountsmaster | businessId | business | 50 | 50 | 50 | 0 | 0 | 0 | PASS |
| accountsmaster | locationId | companylocation | 50 | 50 | 50 | 0 | 0 | 0 | PASS |
| accountsmaster | parentAccountId | accountsmaster | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | businessId | business | 8 | 8 | 8 | 0 | 0 | 0 | PASS |
| agent | typeId | contacttype | 8 | 8 | 8 | 0 | 0 | 0 | PASS |
| agent | agentId | agent | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | paymentLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | purchaseTermsId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | purchasesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | purchasesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | tdsLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | salesTermId | salesterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | transporterId | transporter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | salesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| agent | salesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| attributeaddon | businessId | business | 4 | 4 | 4 | 0 | 0 | 0 | PASS |
| b2binvoice | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodeitem | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodeitem | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodelabelsetting | businessId | business | 4 | 4 | 3 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| barcodelabelsetting | locationId | companylocation | 4 | 4 | 4 | 0 | 0 | 0 | PASS |
| barcodeprintbatch | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodeprintbatch | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodeprintbatch | barcodeSettingId | barcodelabelsetting | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| barcodesetting | businessId | business | 18 | 18 | 16 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| business | parentBusinessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| citygroup | businessId | business | 4 | 4 | 3 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| companylocation | businessId | business | 12 | 12 | 7 | 0 | 5 | 0 | PRE_EXISTING_DANGLING |
| contact | businessId | business | 58125 | 58125 | 58124 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| contact | typeId | contacttype | 55 | 55 | 55 | 0 | 0 | 0 | PASS |
| contact | agentId | contact | 7 | 7 | 7 | 0 | 0 | 0 | PASS |
| contact | paymentLedgerId | ledger | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| contact | purchaseTermsId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| contact | purchasesLedgerId | ledger | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| contact | purchasesReturnLedgerId | ledger | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| contact | tdsLedgerId | ledger | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| contact | salesTermId | salesterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| contact | transporterId | transporter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| contact | salesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| contact | salesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| contacttype | businessId | business | 11 | 11 | 9 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| creditnote | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| creditnote | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | typeId | contacttype | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | agentId | agent | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | paymentLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | purchaseTermsId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | purchasesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | purchasesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | tdsLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | salesTermId | salesterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | transporterId | transporter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | salesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| customer | salesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| debitnote | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| debitnote | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| debitnote | agentId | agent | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| debitnote | logisticId | logistic | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| delivery | businessId | business | 46 | 46 | 46 | 0 | 0 | 0 | PASS |
| delivery | locationId | companylocation | 46 | 46 | 46 | 0 | 0 | 0 | PASS |
| delivery | transporterId | transporter | 46 | 46 | 46 | 0 | 0 | 0 | PASS |
| delivery | supplierId | supplier | 46 | 46 | 35 | 0 | 11 | 0 | PRE_EXISTING_DANGLING |
| delivery | dispatchId | dispatch | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| deliverychallan | businessId | business | 6 | 6 | 6 | 0 | 0 | 0 | PASS |
| deliverychallan | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| deliverychallan | customerId | customer | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| deliverychallan | stockPointId | stockpoint | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| deliverychallan | logisticId | logistic | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| deliverychallan | salesGroupId | purchasegroup | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| deliverychallan | salesPersonId | agent | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| deliverychallan | salesLedgerId | ledger | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| deliverychallan | agentId | agent | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| deliverychallan | stockTransferLocationId | stocktransferlocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| deliverychallan | stockTransferReceivedId | stocktransferreceived | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| dispatch | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| dispatch | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| dispatch | vehicleId | vehicle | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| dispatch | driverId | driver | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| dispatch | routeId | transportroute | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| dispatch | deliveryIds | delivery | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| docsetup | businessId | business | 13 | 13 | 13 | 0 | 0 | 0 | PASS |
| driver | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| driver | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| ecommerceproduct | businessId | business | 8 | 8 | 8 | 0 | 0 | 0 | PASS |
| ecommerceproduct | itemId | item | 8 | 8 | 8 | 0 | 0 | 0 | PASS |
| ecommerceproduct | byWeave | productclassificationoption | 2 | 5 | 5 | 0 | 0 | 0 | PASS |
| ecommerceproduct | byFabric | productclassificationoption | 4 | 10 | 10 | 0 | 0 | 0 | PASS |
| ecommerceproduct | byCraft | productclassificationoption | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| ecommerceproduct | byOccasion | productclassificationoption | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| ecommerceproduct | byColour | productclassificationoption | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| ecomsetting | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| grc | businessId | business | 147 | 147 | 146 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| grc | locationId | companylocation | 147 | 147 | 146 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| grc | supplierId | supplier | 146 | 146 | 140 | 0 | 6 | 0 | PRE_EXISTING_DANGLING |
| grc | lrTransactionId | delivery | 43 | 43 | 40 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| grc | purchaseTermId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| grc | purchaseGroupId | purchasegroup | 37 | 37 | 37 | 0 | 0 | 0 | PASS |
| grc | agentId | agent | 128 | 128 | 128 | 0 | 0 | 0 | PASS |
| grc | logisticId | logistic | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| grc | stockPointId | stockpoint | 31 | 31 | 17 | 0 | 14 | 0 | PRE_EXISTING_DANGLING |
| grt | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| grt | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| grt | supplierId | supplier | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| grt | purchaseGroupId | purchasegroup | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| grt | purchaseTermId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| grt | agentId | agent | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| grt | logisticId | logistic | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| hsn | businessId | business | 121 | 121 | 118 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| hsrimportjob | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| hsrimportjob | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| hsrimportjob | sourceLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| hsrimportjob | userId | user | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icautopurchasereceived | businessId | business | 3 | 3 | 2 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| icautopurchasereceived | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereceived | icSalesInvoiceId | icsalesinvoice | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereceived | grcId | grc | 3 | 3 | 1 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| icautopurchasereceived | fromBusinessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereceived | fromLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | toBusinessId | business | 3 | 3 | 1 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| icautopurchasereturn | toLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | supplierId | contact | 3 | 3 | 0 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| icautopurchasereturn | stockPointId | stockpoint | 3 | 3 | 0 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| icautopurchasereturn | agentId | contact | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | salesPersonId | contact | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icautopurchasereturn | logisticId | logistic | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icdeliverychallan | businessId | business | 45 | 45 | 45 | 0 | 0 | 0 | PASS |
| icdeliverychallan | locationId | companylocation | 45 | 45 | 45 | 0 | 0 | 0 | PASS |
| icdeliverychallan | toBusinessId | business | 45 | 45 | 45 | 0 | 0 | 0 | PASS |
| icdeliverychallan | toLocationId | companylocation | 45 | 45 | 45 | 0 | 0 | 0 | PASS |
| icdeliverychallan | stockPointId | stockpoint | 45 | 45 | 32 | 0 | 13 | 0 | PRE_EXISTING_DANGLING |
| icdeliverychallan | agentId | contact | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icdeliverychallan | salesPersonId | contact | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| icdeliverychallan | logisticId | logistic | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| iciteminvoice | businessId | business | 20 | 20 | 20 | 0 | 0 | 0 | PASS |
| iciteminvoice | locationId | companylocation | 20 | 20 | 20 | 0 | 0 | 0 | PASS |
| iciteminvoice | toBusinessId | business | 20 | 20 | 20 | 0 | 0 | 0 | PASS |
| iciteminvoice | toLocationId | companylocation | 20 | 20 | 20 | 0 | 0 | 0 | PASS |
| iciteminvoice | items.barcodeId | barcodeLabel | 20 | 26 | 0 | 0 | 8 | 18 | EXPECTED_EXCLUDED |
| iciteminvoice | items.sourceBarcodeId | barcodeLabel | 20 | 26 | 0 | 0 | 8 | 18 | EXPECTED_EXCLUDED |
| icpurchasereceived | businessId | business | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| icpurchasereceived | locationId | companylocation | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| icpurchasereceived | icItemInvoiceId | iciteminvoice | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| icpurchasereceived | fromBusinessId | business | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| icpurchasereceived | fromLocationId | companylocation | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| icsalesinvoice | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesinvoice | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesinvoice | toBusinessId | business | 3 | 3 | 2 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| icsalesinvoice | toLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesinvoice | icDeliveryChallanIds | icdeliverychallan | 3 | 3 | 0 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| icsalesreturn | businessId | business | 3 | 3 | 1 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| icsalesreturn | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesreturn | icAutoPurchaseReturnId | icautopurchasereturn | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesreturn | fromBusinessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| icsalesreturn | fromLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| invoicelayoutsetting | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| invoicelayoutsetting | locationId | companylocation | 2 | 2 | 1 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| item | businessId | business | 411 | 411 | 411 | 0 | 0 | 0 | PASS |
| item | subGroupId | productgroup | 145 | 145 | 145 | 0 | 0 | 0 | PASS |
| item | uomId | uom | 143 | 143 | 143 | 0 | 0 | 0 | PASS |
| item | hsnId | hsn | 145 | 145 | 145 | 0 | 0 | 0 | PASS |
| item | filterId | productfilter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| journalentry | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| journalentry | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| journalentry | reversalOf | journalentry | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| journalentry | reversedBy | journalentry | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| ledger | businessId | business | 3 | 3 | 2 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| ledger | ledgerGroupId | ledgergroup | 3 | 3 | 0 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| ledgergroup | businessId | business | 99 | 99 | 49 | 0 | 50 | 0 | PRE_EXISTING_DANGLING |
| ledgergroup | parentGroupId | ledgergroup | 91 | 91 | 91 | 0 | 0 | 0 | PASS |
| ledgergroupmapping | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| locationsetting | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| locationsetting | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| loginsecurity | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| logistic | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| logistic | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| logistic | supplierId | supplier | 2 | 2 | 0 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| productclassificationoption | businessId | business | 184 | 184 | 184 | 0 | 0 | 0 | PASS |
| productfilter | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| productfilter | parentId | productfilter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| productgroup | businessId | business | 116 | 116 | 113 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| productgroup | parentId | productgroup | 40 | 40 | 40 | 0 | 0 | 0 | PASS |
| purchasecharge | businessId | business | 7 | 7 | 5 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| purchasecharge | purchaseChargeLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| purchasegroup | businessId | business | 21 | 21 | 11 | 0 | 10 | 0 | PRE_EXISTING_DANGLING |
| purchaseinvoice | businessId | business | 28 | 28 | 28 | 0 | 0 | 0 | PASS |
| purchaseinvoice | locationId | companylocation | 28 | 28 | 28 | 0 | 0 | 0 | PASS |
| purchaseinvoice | supplierId | supplier | 27 | 27 | 13 | 0 | 14 | 0 | PRE_EXISTING_DANGLING |
| purchaseinvoice | purchaseGroupId | purchasegroup | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| purchaseinvoice | purchaseTermId | purchaseterm | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| purchaseinvoice | agentId | agent | 23 | 23 | 13 | 0 | 10 | 0 | PRE_EXISTING_DANGLING |
| purchaseinvoice | logisticId | logistic | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| purchaseratecode | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| purchaseratecode | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| purchaseterm | businessId | business | 7 | 7 | 4 | 0 | 3 | 0 | PRE_EXISTING_DANGLING |
| role | businessId | business | 4 | 4 | 4 | 0 | 0 | 0 | PASS |
| rolepermission | businessId | business | 7 | 7 | 7 | 0 | 0 | 0 | PASS |
| salesinvoice | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| salesinvoice | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| salesinvoice | customerId | customer | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| salesperson | businessId | business | 5 | 5 | 5 | 0 | 0 | 0 | PASS |
| salesreturn | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| salesreturn | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| salesreturn | customerId | customer | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| salesreturn | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| salesterm | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| splitbarcodesetting | businessId | business | 2 | 2 | 1 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| stockadjustment | businessId | business | 79 | 79 | 79 | 0 | 0 | 0 | PASS |
| stockadjustment | locationId | companylocation | 79 | 79 | 79 | 0 | 0 | 0 | PASS |
| stockadjustment | stockPointId | stockpoint | 2 | 2 | 0 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| stockmovement | businessId | business | 43641 | 43641 | 43596 | 0 | 45 | 0 | PRE_EXISTING_DANGLING |
| stockmovement | itemId | item | 21995 | 21995 | 21989 | 0 | 6 | 0 | PRE_EXISTING_DANGLING |
| stockmovement | fromLocationId | companylocation | 567 | 567 | 567 | 0 | 0 | 0 | PASS |
| stockmovement | toLocationId | companylocation | 43220 | 43220 | 43175 | 0 | 45 | 0 | PRE_EXISTING_DANGLING |
| stockmovement | barcodeId | barcodeLabel | 43641 | 43641 | 0 | 0 | 21826 | 21815 | EXPECTED_EXCLUDED |
| stockpoint | businessId | business | 8 | 8 | 7 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| stockpoint | locationId | companylocation | 6 | 6 | 6 | 0 | 0 | 0 | PASS |
| stockpoint | parentId | stockpoint | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| stocktransfer | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| stocktransfer | fromLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| stocktransfer | toLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| stocktransfer | toStockPointId | stockpoint | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| stocktransfer | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| stocktransferlocation | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferlocation | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferlocation | fromLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferlocation | toLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferlocation | toStockPointId | stockpoint | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| stocktransferlocation | packetIds | stocktransferpacket | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferlocation | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| stocktransferpacket | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferpacket | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferpacket | fromLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferpacket | toLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferpacket | toStockPointId | stockpoint | 2 | 2 | 0 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| stocktransferpacket | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| stocktransferreceived | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferreceived | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferreceived | stockTransferLocationId | stocktransferlocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferreceived | fromLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferreceived | toLocationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| stocktransferreceived | toStockPointId | stockpoint | 1 | 1 | 0 | 0 | 1 | 0 | PRE_EXISTING_DANGLING |
| stocktransferreceived | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| storedebitnote | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storedebitnote | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storedebitnote | fromLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storedebitnote | salesInvoiceId | storesalesinvoice | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storedebitnote | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| storedeliverychallan | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| storedeliverychallan | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| storedeliverychallan | toLocationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| storedeliverychallan | stockPointId | stockpoint | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| storedeliverychallan | salesInvoiceId | storesalesinvoice | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storedeliverychallan | items.barcodeId | barcodeLabel | 2 | 2 | 0 | 0 | 0 | 2 | EXPECTED_EXCLUDED |
| storesalesinvoice | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesinvoice | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesinvoice | toLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesinvoice | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| storesalesreturn | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesreturn | locationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesreturn | fromLocationId | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesreturn | salesInvoiceId | storesalesinvoice | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| storesalesreturn | items.barcodeId | barcodeLabel | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| supplier | businessId | business | 801 | 801 | 801 | 0 | 0 | 0 | PASS |
| supplier | typeId | contacttype | 9 | 9 | 9 | 0 | 0 | 0 | PASS |
| supplier | agentId | agent | 5 | 5 | 5 | 0 | 0 | 0 | PASS |
| supplier | paymentLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | purchaseTermsId | purchaseterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | purchasesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | purchasesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | tdsLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | salesTermId | salesterm | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | transporterId | transporter | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | salesLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| supplier | salesReturnLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| tax | businessId | business | 15 | 15 | 8 | 0 | 7 | 0 | PRE_EXISTING_DANGLING |
| tax | igstLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| tax | cgstLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| tax | sgstLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| tax | cessLedgerId | ledger | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| transferlock | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| transporter | businessId | business | 15 | 15 | 15 | 0 | 0 | 0 | PASS |
| transporter | locationId | companylocation | 15 | 15 | 15 | 0 | 0 | 0 | PASS |
| transportroute | businessId | business | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| transportroute | locationId | companylocation | 1 | 1 | 1 | 0 | 0 | 0 | PASS |
| uom | businessId | business | 15 | 15 | 13 | 0 | 2 | 0 | PRE_EXISTING_DANGLING |
| user | businessId | business | 5 | 5 | 5 | 0 | 0 | 0 | PASS |
| user | locationIds | companylocation | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| user | counterId | poscounter | 0 | 0 | 0 | 0 | 0 | 0 | EXPECTED_EXCLUDED |
| vehicle | businessId | business | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| vehicle | locationId | companylocation | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| voucher | businessId | business | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| voucher | locationId | companylocation | 3 | 3 | 3 | 0 | 0 | 0 | PASS |
| voucher | partyLedgerId | ledger | 2 | 2 | 2 | 0 | 0 | 0 | PASS |
| vouchersetting | businessId | business | 0 | 0 | 0 | 0 | 0 | 0 | PASS |

Definitions checked: 299; passed: 286; failed: 0; expected-excluded: 13. References checked: 215670; resolved in target: 171674; lost in target: 0; already dangling in source: 22143; source-resolvable but excluded: 21853.

`FAIL` means a referenced document exists in the source but is absent from the target — a real migration loss. `PRE_EXISTING_DANGLING` means the referenced id is missing from **both** databases; it was already broken in the source and is not a migration failure. `EXPECTED_EXCLUDED` rows point at `barcodeLabel` or a POS collection that was intentionally excluded; `Source-resolvable but excluded` counts references that would resolve if the excluded collection were migrated.

## Warnings

- 52 relationship(s) contain 301 reference(s) that are already dangling in the source and are not migration failures; 21842 additional dangling reference(s) sit inside intentionally excluded references.

## Application connection verification

- The target replica set advertises `127.0.0.1:27017`. From this machine the application's normal URI needs `directConnection=true`; without it, topology discovery tries the advertised private address and fails.
- The application database URI in the repository was **not** changed. Changing it is a separate operation and requires explicit approval.
- Database-level module checks can be run against the target with `directConnection=true`. Application login cannot be exercised without a valid test credential.

## Deliverables

- `MONGODB_MIGRATION_AUDIT.md`
- `MONGODB_MIGRATION_RESULTS.md`
- `mongodb-migration-report.json`
- `mongodb-migration-errors.log`
