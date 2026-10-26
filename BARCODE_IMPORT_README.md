# Barcode + Master Data Import

Production Excel import for **barcodes, opening stock and master data** in the
Orbit / GROO ERP.

The import lives at **`/admin/report/data-import`** behind the **Add Import**
button. It has one server-side engine, one set of validators and one write
path, so the same rules apply whether a row comes from Excel, from the in-page
master creator, or from a retried import.

> **Core promise:** the importer never invents a barcode number, item code,
> master ID or document number, never increments a code to get past a
> duplicate, and never silently overwrites an existing barcode or master.

---

## 1. At a glance

| Item | Value |
| --- | --- |
| Screen | `/admin/report/data-import` → **Add Import** |
| Import types | Barcode + Master Data, Barcode / Stock Update, Master Data |
| Template | Real `.xlsx`, downloadable per import type |
| Workbook sheets | Instructions, Barcode Import, Master Data, Existing Master Reference |
| Parsing | Server-side; the browser never posts row data back |
| Validation | Per-row status, missing-master detection, duplicate detection |
| Master resolution | Missing / ambiguous references can be created, mapped to an existing master, rechecked or reviewed |
| Preview | Server-paginated with filters |
| Session restore | The stored workbook, mappings and created masters survive a page refresh for the session TTL |
| Writes | Masters in dependency order, then barcodes, then stock through the inventory engine |
| Stock safety | Explicit confirmation required for stock replacement |
| Audit | Every run recorded in `HsrImportJob` |
| Error report | Downloadable `.xlsx` with row, field, message, correction and status |
| Permission | **Barcode Generate**, scoped to the selected location |

---

## 2. Where the user finds it

1. Open **Excel / Data Import** (`/admin/report/data-import`).
2. Select the **business**, **location** and **financial year** in the scope bar.
3. Click **Add Import**.
4. Choose one of the three import types.
5. Download the template, fill it, upload it.
6. Review the analysis, choose a strategy, confirm the preview.
7. Run the import and download the result / validation report.

The page also keeps the older **Mass Barcode Import** card, which opens the
HSR opening-stock wizard. That flow is described in section 11.

---

## 3. Import types and strategies

### Barcode + Master Data Import

Creates missing masters (only the ones explicitly listed or safely derivable),
then creates new barcode rows and opens their stock.

| Strategy | What it does |
| --- | --- |
| **Create missing masters + import barcodes** | Creates valid missing masters in dependency order, resolves their real IDs, revalidates the same workbook, then imports every ready barcode row. Existing barcodes are skipped, never duplicated. |
| **Import using existing masters only** | Creates nothing. Rows whose Item, Supplier, HSN, Group, Sub Group, UOM or Location is missing are excluded and reported. |

Stock opening uses the inventory engine (`GRC_IN`), not a direct quantity
write.

A workbook value that matches more than one master is **ambiguous**. The
importer never picks the first row in that case: the reference is held for a
decision and the import is disabled until the operator chooses the correct
master in the Review step.

### Barcode / Stock Update

Updates the quantity of **existing barcodes only**. It never creates a barcode
or a master.

- Only **Barcode Number** and **Opening Quantity** are used.
- The user must tick **“Replace existing stock quantities with the workbook
  quantities.”**
- Without that confirmation the server refuses the whole run with HTTP `422`
  **before any write**.
- A confirmed replacement writes an `ADJUST_IN` or `ADJUST_OUT` delta through
  `applyMovement`, so the movement ledger and the barcode row always agree.

### Master Data Import

Creates masters from the **Master Data** sheet only. It never writes a barcode
row.

- Existing masters are reused by code/name and are never edited.
- Parent dependencies (HSN/UOM/Sub Group → Item, Group → Sub Group) must exist
  or be included in the same workbook. A Supplier/Agent also needs an existing
  Contact Type in Masters; the importer does not create Contact Types.

---

## 4. The template

Download from the wizard (the business must be selected first). The route
returns a real styled workbook:

| Import type | File name |
| --- | --- |
| Barcode + Master Data | `barcode-master-data-import-template.xlsx` |
| Barcode / Stock Update | `barcode-stock-update-template.xlsx` |
| Master Data | `master-data-import-template.xlsx` |

Every template contains:

1. **Instructions** – the rules, required columns and examples.
2. **Barcode Import** – one row per barcode.
3. **Master Data** – only masters that do not exist yet.
4. **Existing Master Reference** – codes and names already in the selected
   business, used as a lookup / dropdown reference.

The writer adds frozen header rows, AutoFilter, sensible column widths,
number/date formats, required-header markers, text formatting for barcode and
code columns (leading zeros are preserved), sample rows and dropdowns where
practical.

**Do not rename the sheets or move the header row.** The parser also accepts
common header aliases, but keeping the template layout is the supported path.

### Sample rows

Sample rows are deliberately visible:

- Barcode sheet: `EXAMPLE0001`, `EXAMPLE0002`
- Master Data sheet: a row whose Master Type starts with `Example`

They are recognised by the `Example` prefix and are **never importable**.
They are counted as examples, not as valid rows: uploading the untouched
template shows `0` ready rows.

---

## 5. Barcode Import sheet

### Required columns

| Column | Notes |
| --- | --- |
| **Barcode Number** | The unit’s own number. Stored as text, so leading zeros and long numeric strings survive. |
| **Item Code** | Must resolve to an Item master, or be creatable from the row’s own fields (group, sub group, UOM, HSN) or from a Master Data row. |
| **Opening Quantity** | The quantity to open. Zero-quantity rows are treated as invalid rather than silently creating empty stock. |

### Supported columns

The template also supports:

- **Identity:** Old Barcode, Item Name, Print Description, Item Attributes
- **Classification:** HSN, Group Name, Sub Group Name, UOM, Batch/Unique,
  Batch No, Serial No
- **Purchase:** Supplier Code, Supplier Name, Agent Code, Agent Name,
  GRC Number, Supplier Invoice Number
- **Dates and pricing:** Purchase Date, Date, Age, Purchase Rate, Discount,
  Final Net Rate, GST Percentage, RSP, Discount Percentage, RSP Offer Price,
  WSP, DP
- **Placement:** Location Name, Company/Business
- **Stock:** Opening Quantity

Columns such as Opening Value, Inward/Outward Quantity, Closing Quantity and
their values are read for context and then **deliberately ignored**; they are
reporting columns, not writes.

### Limits

- Maximum file size: **20 MB**
- Maximum rows per workbook: **50,000**
- Accepted formats: `.xlsx` and `.xlsm` (save `.xls` as `.xlsx` first)

### Old item-wise summary workbooks

A legacy item-wise stock summary has no barcode number column. It is rejected
with a direct message (`BARCODE_COLUMN_MISSING`) instead of creating thousands
of meaningless rows. Use the HSR opening-stock import for that workbook shape.

---

## 6. Master Data sheet

Each row declares one master of one type.

| Master Type | Required fields |
| --- | --- |
| **Supplier** | Name, Contact Type |
| **Agent** | Name, Contact Type |
| **Item** | Code, Name, Parent (Sub Group), UOM, HSN |
| **HSN** | Code |
| **Group** | Name |
| **Sub Group** | Name, Parent (Group) |
| **UOM** | Code (short name), Name |
| **Location** | Name, City, Zip Code |

Optional fields include code, short name, address, city, state, zip code,
mobile, email, GST number, status, effective date, RSP, WSP, item type, prefix
and description.

### Dependency order

Masters are created in this order so a child never points at a missing parent:

```
HSN → UOM → Group → Sub Group → Location → Supplier → Agent → Item
```

- An Item needs its Sub Group, HSN and UOM.
- A Sub Group needs its Group.
- A Supplier/Agent needs its Contact Type.
- A missing parent that is not itself being created blocks the dependent row
  instead of inventing a parent.

### Existing masters

Existing masters are matched by code or name. Candidate matching normalises
whitespace and casing, but it keeps leading zeros and every meaningful
character in a code (`000123` and `123` are different codes). Saved mapping
aliases additionally ignore punctuation that the workbook commonly changes
(`ABC-1` vs `ABC 1`).

- One match: the master is **reused without modification**.
- More than one match: the reference is **Ambiguous**. It is never silently
  resolved to the first record. Choose the right master in Review; ambiguous
  references do not get a “create another” shortcut.
- If an Item already exists, its name, group, prices and other fields are not
  overwritten by the import.

A Sub Group is matched under its Group when the workbook supplies one, so the
same Sub Group name under two different Groups is not treated as the same
record.

### In-page master creation

The review step can create a missing master without editing Excel:

- **Create missing master** on a row, **Create all detected** for the current
  creatable list, or **Create new…** from a mapping-error entry. Ambiguous
  references must be resolved to an existing record unless the operator first
  removes/corrects the ambiguous masters.
- **Select existing master** searches the real masters of the selected business
  and maps the workbook value to the chosen record.
- **Review details** shows the workbook value, row numbers, field, parent,
  candidates and the reason the reference needs a decision.
- **Recheck masters** revalidates the stored workbook against the masters as
  they are now.

Creation and mapping both post to the same server-side validators and writer,
then revalidate the **same stored workbook**. There is no second code path that
could be looser than the Excel path. Up to 100 masters can be created in one
request and 200 mappings can be saved in one request.

Every write returns the real MongoDB `_id`; that is the only value passed into
`supplierId`, `itemId`, `hsnId`, `uomId`, `subGroupId` or `locationId` on
import. The importer never stores a name/code in an ObjectId field and never
invents an id.

### Master reference statuses

| Status | Meaning |
| --- | --- |
| **Missing** | The workbook value does not resolve to a master and no explicit choice exists yet. It may be creatable or blocked. |
| **Ambiguous** | The value matches more than one existing master. A choice is required; this blocks the import. |
| **Mapping error** | A saved choice points at a master that no longer exists (or is otherwise invalid). Re-select or create a replacement. |
| **Mapped** | The operator chose an existing master or the master was created in this session. The row now carries its real id. |
| **Created** | The master was actually inserted by this import session. Existing records reused by creation are marked **Reused**. |
| **Verified** | The saved mapping was rechecked and still resolves to a live record in this business. |
| **Error** | The reference failed validation or its saved mapping is stale. |

Mappings are stored on the import session, not only in the browser. They are
applied again on every recheck and on execution, and they survive a page
refresh for the life of the session. Removing a mapping is a normal save with
`removeKeys`, so it takes the same ownership check and revalidates the workbook.

### Business and Location

- **Business** is a scope-level choice. The workbook’s **Company/Business**
  value is compared with the selected business and produces a warning on a
  mismatch; it never creates a Business master and never re-scopes the import.
- **Location** is the row-level stock location. A mapped Location is used for
  that row; otherwise the wizard’s default location applies.
- A **Stock Point** is currently the same selection as the row/selected
  Location. `currentStockPointId` is left `null`; the import does not invent a
  separate stock point.

---

## 7. Validation model

Validation happens on the server when the workbook is uploaded and again when
it is executed. The preview is advice; execution is the decision.

A barcode row can be:

| Status | Meaning |
| --- | --- |
| **Ready** | Valid and importable under the selected strategy. |
| **Valid** | Valid data, but not necessarily importable yet (for example, waiting for a master that this run will create). |
| **Invalid** | A field failed validation (bad number, missing required value, bad date, etc.). |
| **Missing master** | A referenced Item, Supplier, Agent, HSN, Group, Sub Group, UOM or Location does not exist. It is either *creatable* from the Master Data sheet or *blocked*. |
| **Ambiguous match** | The value matches more than one master. The import is blocked until the operator chooses one. |
| **Mapping error** | A saved master choice is stale or invalid (for example, the record was deleted). The import is blocked until it is re-mapped. |
| **Mapped** | The row uses a master chosen or created in this session; the resolved real id is shown in the preview. |
| **Existing barcode** | The barcode number already exists in this business. It is never duplicated or overwritten by this import type. |
| **Duplicate** | The same barcode or master appears more than once in the workbook. |
| **Example** | A template sample row; never imported. |
| **Ignored** | A blank/instruction/summary row that carries no import data. |

### Missing and ambiguous masters

The Review step groups unresolved references by master type and workbook value.
Each entry shows:

- the master type, Excel value, field and parent (for a Sub Group),
- the affected barcode row numbers,
- why it failed / why it needs a decision,
- the possible existing matches (code, name, city/zip, parent),
- the actions **Create Master**, **Select Existing Master**, **Review Details**
  and **Recheck Masters**.

A barcode row with a missing master is **not** written until that master
exists. Strategy A creates the listed masters first and revalidates, which is
why a row can move from *missing master* to *ready* inside one run.

An ambiguous or stale mapping is a **hard blocker**:

- the Preview and Import buttons are disabled;
- the execute stream emits an `error` event with code `RESOLUTION_REQUIRED`
  before any barcode, stock or master write (the service marks the refusal as
  HTTP `409` internally);
- the message names the first unresolved reference and returns up to 20
  blockers.

### Duplicates

- Duplicate barcode numbers inside the workbook are marked **Duplicate**.
- A barcode that already exists in the business is marked **Existing barcode**.
- Neither is “fixed” by appending a suffix or incrementing a number. The
  operator decides whether to remove the row or use the stock-update import.

---

## 8. What actually gets written

`lib/barcodeMasterImportService.js` is the only module that writes. It follows
three rules:

### Nothing is invented

- Barcode numbers and item codes come from the workbook.
- Contact codes may come from the ERP’s own counter (`nextContactId`) when the
  workbook leaves them blank; they are never guessed to dodge a duplicate.
- Master IDs are resolved to real database ObjectIds after creation. They are
  never fabricated.

### Nothing is overwritten silently

- New barcodes are inserted only if the number still does not exist at
  **execution** time, re-read from the database rather than trusted from the
  preview.
- An existing barcode is skipped in strategies A and B.
- A quantity changes only under strategy C, with `replaceStock === true`.
- Existing masters are reused; their fields are not edited.

### Every stock change goes through the inventory engine

- New barcode units open with `applyMovement(GRC_IN)`.
- A replaced quantity writes an `ADJUST_IN` / `ADJUST_OUT` delta.
- Lifecycle fields (`status`, current location, quantities) are never written
  directly, so the barcode row and the stock-movement ledger cannot disagree.

### Idempotency and failure handling

- Every run creates an `HsrImportJob` with the real operation
  (`BARCODE_MASTER_IMPORT`, `BARCODE_STOCK_UPDATE`, `MASTER_DATA_IMPORT`).
- Each barcode row gets a stable `clientRowId` = `<file hash>:<row number>`.
- A retry of the same file skips rows already written and recovers a row whose
  insert landed but whose movement did not.
- Barcodes are written in chunks of 200. Each chunk and its `GRC_IN` movements
  commit in one transaction where MongoDB supports transactions.
- If a chunk fails, rows are retried individually so one bad row cannot roll
  back a whole workbook.
- The final counts come from writes that actually happened, not from the
  preview. A run can finish `COMPLETED`, `PARTIAL` or `FAILED`.

---

## 9. Preview and result counts

The preview is paginated on the server and filtered with:

- All records
- Valid
- Invalid
- Missing master
- Ambiguous match
- Mapping error
- Existing barcode
- Duplicate
- Ready to import
- Mapped rows are marked in the row badge and counted separately from plain
  ready rows.

The result screen reports:

| Count | Meaning |
| --- | --- |
| **Created / inserted** | New barcode rows actually written. |
| **Masters created** | New master records actually written. |
| **Updated** | Existing barcodes whose stock was replaced. |
| **Skipped** | Rows deliberately skipped by the strategy, already imported, or backed by an existing barcode. |
| **Failed** | Rows that could not be written or were blocked by validation. |
| **Recovered** | Rows whose earlier partial write was completed safely on retry. |
| **Failures total** | Full failure count, even when the screen/report shows the first 500. |

`inserted` and `created` are returned as aliases for the same number so the
wizard and the older job-history view can both read it correctly.

---

## 10. Validation / error workbook

Download **Validation Report** from Review, or **Download Error Report** from
Results. The workbook contains:

1. **Validation Report** – one line per rejected/skipped/ambiguous row.
2. **Summary** – the analysis counts, including ambiguous references and
   mapping errors.
3. **Missing Masters** – each unresolved master value with a resolution
   (`Create master`, `Choose existing master`, `Fix mapping` or `Blocked`) and
   the reason.

Columns:

| Column |
| --- |
| Original Row |
| Barcode Number |
| Item Code |
| Supplier Code |
| Sheet |
| Failed Field |
| Uploaded Value |
| Error |
| Suggested Correction |
| Status |

Existing barcodes are listed with status **“Existing barcode - skipped”**, so
the operator can see how the importer treated that row. Execution failures are
appended to the same report after a run.

---

## 11. HSR / opening-stock import

The older **Mass Barcode Import** card on the data-import page opens the HSR
wizard (`components/HsrImport.jsx`). It is kept separate because HSR workbooks
are item-wise opening-stock files without barcode numbers, while the new
Add Import flow is barcode-row based.

### Operations

| Operation | Effect |
| --- | --- |
| **Update Barcode/Item Details** | Updates barcode and item fields (description, HSN, pricing) without changing stock. |
| **Add New Barcodes** | Creates barcode records for items that do not yet have them. |
| **Replace Stock Quantities** | Replaces the target warehouse quantity with the Excel quantity. |
| **Add Opening Stock** | Adds the Excel quantity as opening stock; existing stock is preserved. |
| **Transfer Stock Between Warehouses** | Moves whole barcode units from the source warehouse to the target. |

### Rules specific to HSR

- A missing **Item, Group, Sub Group, HSN, UOM or Supplier** master is a
  **warning**, not a blocker. The barcode keeps the workbook `itemCode` and
  `itemName`; `itemId` may be `null`, exactly as the warehouse seed imported
  those rows.
- Barcode metadata can be updated without an `itemId`. The Item master itself
  is updated only when a real `itemId` is linked.
- **Transfer** moves whole barcode units. A partial split is skipped with a
  reason rather than guessing which unit to split.
- Batch type resolves from the workbook **Batch/Unique** column, then
  `Item.uniqueBarcode`, then defaults to **batch**.
- The route reads `multipart/form-data` (the old JSON path could never carry the
  workbook). Analyze writes nothing; execute writes per operation.
- Each operation wraps its own transaction/chunks. One bad row does not roll
  back 20,000 good rows, and a retry continues from what was already committed.
- Idempotency uses the workbook hash + row identity, so retrying the same file
  does not double stock.

### Seeding alignment

The HSR/warehouse seeding scripts follow the same write rules:

- `scripts/seedHsrOpening.mjs` – HSR opening stock and `--sync` repair mode.
- `scripts/seed-warehouse-stock.js` – item-wise warehouse-stock profiles
  (`temple`, `suvarna`, `omshree`).

They are **dry runs by default**. Writes need `--apply` (HSR) or `--confirm`
(warehouse stock). They use `applyMovement` and `withTransaction`, keep
missing-item rows as `itemId=null` only when explicitly allowed, and never
change barcode numbers, location ids, status, sales/billing/transfer links or
images during a sync. `--sync` updates only source-controlled fields and never
inserts rows missing from the workbook.

Commands:

```bash
npm run hsr:sync          # dry run: compare existing HSR barcodes to workbook
npm run hsr:sync:apply    # write the source-controlled fields
npm run seed:warehouse-stock -- --profile temple --file "<workbook>"
```

### HSR limits

- Maximum upload: **40 MB**
- Large workbooks are supported; the reference HSR workbook contains
  **20,548 rows** and is parsed in one analyze request.

### What was repaired

The previous HSR path failed before validation because it expected JSON while
the browser sent FormData. It now reads the form correctly, reconciles masters
with warnings instead of hard blocks, supports rows with `itemId=null`, counts
real writes in update-details, writes stock only through the ledger, and can be
retried without duplicating quantities.

---

## 12. API reference

All routes require the **Barcode Generate** permission. Import sessions are
also checked against the user who uploaded them.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/barcode-import/template?business=<id>&scope=<scope>` | Download the styled template for the selected business. |
| `POST` | `/api/barcode-import/analyze` | Multipart upload (`file`, `business`, `location`, `finYear`, `scope`). Parses, validates, stores the workbook under a 48-hex token, returns the summary. |
| `GET` | `/api/barcode-import/session?token=&sheet=&filter=&page=&perPage=&strategy=` | Server-paginated preview of the stored workbook. |
| `GET` | `/api/barcode-import/masters?business=&type=&q=&limit=` | Server-side master search for the “Select existing master” dialog. Returns only matching records, never the whole master list. |
| `POST` | `/api/barcode-import/masters` | `{ token, mappings: [...], removeKeys: [...] }` saves explicit workbook-value → master choices, then revalidates the stored workbook. |
| `POST` | `/api/barcode-import/resolve` | `{ token, masters: [...] }` creates in-page masters (with optional `reference`) and revalidates; `{ token, revalidate: true }` rechecks after masters changed elsewhere. |
| `POST` | `/api/barcode-import/execute` | `{ token, strategy, replaceStock }`; streams NDJSON progress and a final `complete`/`error` event. Unresolved ambiguity ends the stream with `RESOLUTION_REQUIRED` before any write. |
| `GET` | `/api/barcode-import/error-report?token=` | Downloads the validation/error workbook. |
| `POST` | `/api/hsr-import` | Multipart HSR analyze/execute (`mode`, `operation`, `business`, `location`, `file`, `finYear`, optional `sourceLocation`, `stockPoint`, `dryRun`). |

### Import scopes

| Scope | Used by |
| --- | --- |
| `BARCODE_MASTER` | Barcode + Master Data Import |
| `BARCODE_STOCK` | Barcode / Stock Update |
| `MASTER_DATA` | Master Data Import |

---

## 13. Session security and storage

- The uploaded workbook is written to the OS temp directory, not the
  repository: `os.tmpdir()/orbit-barcode-import` by default.
- Override the directory with `BARCODE_IMPORT_TMP_DIR`; override the TTL with
  `BARCODE_IMPORT_TTL_MS`.
- Default TTL: **2 hours**.
- Token format: exactly **48 lowercase hex characters**; anything else is
  rejected before it can be used as a file name.
- The server stores the workbook, its analysis, the saved `masterMappings` and
  the session’s `masterCreations`. The browser receives only the
  summary/preview, a token and those server-owned choices; it never posts row
  data or master ids back as authoritative data.
- The browser keeps only the 48-hex token in `sessionStorage` under
  `orbit.barcode-import.session`. On refresh the wizard re-fetches the stored
  session, the preview page, mappings and created masters from the server.
  There is no way to restore a doctored preview from the browser.
- `assertSessionOwner` refuses another user’s session with HTTP `403`.
- Expired sessions return HTTP `410` and ask for a fresh upload.
- Expired files are pruned whenever a new session is created.

---

## 14. File map

| File | Responsibility |
| --- | --- |
| `app/admin/report/data-import/page.jsx` | Page wiring and the **Add Import** entry point. |
| `components/BarcodeMasterImport.jsx` | The three-scope wizard: upload, review, preview, results. |
| `lib/barcodeMasterImportConstants.js` | Scopes, strategies, statuses, fields, filters, report columns. No server-only imports. |
| `lib/barcodeMasterImport.js` | Workbook parsing, header aliases, validation, master planning, template and error-workbook building. |
| `lib/barcodeMasterImportService.js` | Database half: reference loading, master creation, barcode writes, stock replacement, execution, session preview, error report. |
| `lib/importSessionStore.js` | Temp workbook/analysis sessions, token validation, TTL and pruning. |
| `lib/barcodeImportAccess.js` | Session ownership check and safe workbook file names. |
| `lib/xlsxWriter.js` | Small XLSX writer with styles, frozen panes, AutoFilter, widths, number/date formats and data validation. |
| `app/api/barcode-import/*` | The seven HTTP routes listed above. |
| `app/api/barcode-import/masters/route.js` | Master search and mapping persistence. |
| `app/api/hsr-import/route.js` | HSR analyze/execute route. |
| `lib/hsrWorkbookImport.js` | HSR workbook parser. |
| `lib/hsrMasterResolution.js` | HSR master matching with warnings for missing masters. |
| `lib/hsrWarehouseReconciliation.js` | HSR stock reconciliation and operation planning. |
| `lib/hsrImportOperations.js` | HSR barcode/stock writes with `itemId` fallback. |
| `components/HsrImport.jsx` | HSR wizard UI. |
| `scripts/seedHsrOpening.mjs` | HSR opening-stock seed / `--sync` repair tool. |
| `scripts/testBarcodeMasterImport.mjs` | 21-scenario acceptance suite. |

### Database models touched

- `BarcodeLabel` – one row per physical barcode unit.
- `StockMovement` – the ledger (`GRC_IN`, `ADJUST_IN`, `ADJUST_OUT`, …).
- `Item`, `Supplier`, `Agent`, `Hsn`, `Tax`, `ProductGroup`, `Uom`,
  `CompanyLocation`, `ContactType` – masters and references.
- `HsrImportJob` – run history and result counts for both the HSR and the new
  barcode import engine.

---

## 15. Testing

```bash
npm run test:barcode-import
```

This runs `scripts/testBarcodeMasterImport.mjs` against the configured database
with `--max-old-space-size=4096`. The suite covers the 21 acceptance scenarios,
including:

- template structure, sample rows and master reference
- a valid barcode importing through the ledger
- missing Item/Supplier/Group/Sub Group/UOM/HSN masters
- create-missing-masters vs existing-masters-only
- existing barcode skips and duplicate detection
- invalid rows writing nothing
- stock replacement refused without confirmation, then applied with it
- retry idempotency and partial-failure recovery
- large workbook handling
- master-only import
- validation/error workbook contents
- sample rows never becoming importable
- unchanged data after failed validation
- duplicate supplier names becoming **Ambiguous**, blocking execution, then
  importing with the chosen real id after mapping
- a mapping to a deleted supplier becoming **Mapping error** and blocking
  execution
- in-page creation returning the real id, persisting the mapping and the
  `masterCreations` list, and reusing them on revalidation
- a Company/Business mismatch warning plus server-side master search

Latest run: **21 passed, 0 failed**.

The HSR pipeline was also exercised against the real
`hsr_opening_19_10_dated.xlsx`:

- **20,548** rows parsed
- **15,454** valid
- **5,094** zero-quantity rows rejected
- **15,439** item codes absent from the Item master kept as warnings
- **0** rows blocked by master resolution

Route-level HTTP checks covered login, template download, analyze, preview
filters, inline master creation, execution, barcode and `GRC_IN` verification,
error-report download, retry idempotency, unconfirmed/confirmed stock
replacement and master-only import.

---

## 16. Troubleshooting

| Symptom | Reason / fix |
| --- | --- |
| `BARCODE_COLUMN_MISSING` | The workbook is an item-wise summary with no Barcode Number column. Use the HSR opening-stock import. |
| “This import session has expired” (410) | The 2-hour session ended or the temp file was cleaned. Upload the workbook again. |
| “Workbook is larger than the 20 MB limit” (413) | Split the workbook into smaller files. |
| `.xls` rejected | Save it as `.xlsx` (the writer/reader uses the modern format). |
| Rows show **Missing master** | Create the listed masters on the Master Data sheet, use the in-page **Create missing master** dialog, or switch to **Create missing masters + import barcodes**. |
| Rows show **Ambiguous match** | More than one master matches the workbook value. Use **Select existing** in Review and choose the correct record. A mismatch cannot be imported until then. |
| Rows show **Mapping error** | A saved choice points at a record that no longer exists. Re-select the master (or create it) and recheck. Execution is refused with `RESOLUTION_REQUIRED` until fixed. |
| Import button is disabled with a master decision panel | Expected. Ambiguous references and mapping errors are hard blockers. Resolve each entry, then preview/import. |
| The review screen disappeared after a refresh | The wizard restores the last token from this tab’s `sessionStorage`. If the session expired (2 hours) or was cleaned, upload the workbook again. |
| A master was created but the row still says missing | Run **Recheck masters**. If the new master was created with a different key than the workbook value, map it explicitly. |
| Rows show **Duplicate** | The same barcode/master appears twice in the workbook. Remove the extra row. |
| Stock update returns 422 | Tick **Replace existing stock quantities** first. Nothing is written until then. |
| Nothing imported from the sample rows | Expected. `EXAMPLE…` rows are templates only. |
| “Barcode Generate” permission denied | Ask an administrator for the permission and access to the selected location. |
| Counts do not equal the number of Excel rows | Blank/instruction/summary rows are ignored; existing/duplicate/strategy-skipped rows are counted as skipped; only real writes count as created/updated. |
| A retry creates nothing | Correct. The same file/row identity was already written; retries are idempotent. |

---

## 17. Limits and non-goals

- The importer does **not** update existing master records. Create them in the
  Masters screens if a value must change.
- The importer does **not** delete barcodes, masters or stock movements.
- The importer does **not** split a barcode unit during an HSR transfer.
- The importer does **not** increment or suffix a barcode to bypass a duplicate.
- The barcode/stock import has no “delete rows from the workbook” feature; the
  operator removes rows in Excel and uploads again.
- Stock replacement is intentionally limited to existing barcodes and requires
  explicit confirmation every time.
- The importer does **not** create a **Business** master. Business is the
  wizard’s scope; a different Company/Business value in the workbook is only a
  warning.
- The importer does **not** create **Tax** or **Brand/Category** masters. GST
  percentage is read as a numeric field and HSN creation can link an existing
  Tax when the HSN fields include a matching GST rate; a missing Tax/Brand is
  not presented as a selectable master reference in this workflow.
- A **Stock Point** is currently the same selection as the row/selected
  Location. There is no separate Stock Point master picker, and
  `currentStockPointId` stays `null`.
- Matching is by normalized code/name and explicit aliases, not fuzzy search.
  A typo that is not an exact normalized match is reported as missing, not
  silently guessed.
- Mappings are session-scoped (2-hour TTL). They are not a permanent alias
  table; a later workbook needs its own choices unless the masters now match
  unambiguously.
- A saved mapping is a reference to one master id. The importer does not edit
  the mapped master’s fields, and deleting that master later turns the mapping
  into a **Mapping error** until it is re-selected.
- At most 200 mappings are saved per request and 100 masters are created per
  in-page request.
- The wizard shows at most 500 execution-failure details per run, but
  `failuresTotal` always carries the full count. The validation report contains
  every analysis error plus the stored execution failures (up to 500).
