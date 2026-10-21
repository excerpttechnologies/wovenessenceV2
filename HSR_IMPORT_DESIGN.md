# HSR Excel Import - Design Document

## Executive Summary

This document outlines the design for extending the existing Barcode Report Import functionality to support the HSR opening stock Excel workbook (`hsr_opening_19_10_dated.xlsx`). The workbook contains 20,548 rows with 27 columns representing opening stock for the HSR warehouse.

## Existing Architecture Analysis

### Current Import System
- **Entry Point:** `/admin/reports/barcode-report` → Import Barcodes button
- **Component:** `components/BarcodeReportImport.jsx`
- **API:** `app/api/reports/barcode-report/import/route.js`
- **Parser:** `lib/barcodeReportImport.js` (Excel/text parsing)
- **Service:** `lib/barcodeReportImportService.js` (master resolution, database operations)
- **Inventory Engine:** `lib/inventory.js` (stock operations, transactions)

### Key Models
1. **BarcodeLabel** - Primary inventory collection (ONE ROW = ONE UNIT OF STOCK)
   - Fields: barcodeNo, itemId, qtyNum, uom, purRate, finalNet, gst, retailPrice, offerPrice, wspPrice, dpPrice, hsn, status, currentLocationId, currentBusinessId, currentStockPointId
   - Status values: IN_STOCK, IN_TRANSIT, SOLD, VOID, HISTORY

2. **Item** - Item master
   - Fields: businessId, name, itemCode, subGroupId, uomId, hsnId, rsp, wsp, description, uniqueBarcode

3. **ProductGroup** - Hierarchical groups
   - Fields: businessId, name, parentId (null for top-level groups)

4. **Supplier** - Supplier master
   - Fields: businessId, businessName, contactId, gstNo, billingState

5. **StockPoint** - Warehouse/stock point
   - Fields: businessId, locationId, stockPoint, type, status

6. **CompanyLocation** - Business location
   - Fields: businessId, name, gstin, state, isMediator

7. **StockMovement** - Audit ledger
   - Fields: type (GRC_IN, TRANSFER_OUT, etc.), barcodeId, qty, fromLocationId, toLocationId, refModel, refId

8. **StockTransfer** - Transfer documents
   - Fields: fromLocationId, toLocationId, lines (array of barcodes), status

9. **Hsn** - HSN codes with tax slabs
   - Fields: code, taxSlabs (array of {gstTaxNameId, amountFrom, amountTo})

10. **Uom** - Unit of measurement
    - Fields: name, shortName, allowDecimal

## HSR Workbook Structure

### File: `hsr_opening_19_10_dated.xlsx`
- **Worksheet:** "hsr opening stk 19 10"
- **Rows:** 20,548 data rows
- **Columns:** 27 columns
- **Duplicate Header:** "Item Code" appears twice (columns 4 and 15)

### Column Mapping

| Excel Column | Target Model/Field | Notes |
|-------------|-------------------|-------|
| sl no. | (ignore) | Serial number, not needed |
| Group Name | ProductGroup.name | Top-level group (parentId = null) |
| Sub Group Name | ProductGroup.name | Subgroup (parentId references Group) |
| Item Code (col 4) | Item.itemCode | Primary item code |
| Supplier Code | Supplier.contactId | Supplier contact code |
| Supplier Name | Supplier.businessName | Supplier name |
| Date | (metadata) | Document date |
| Age | (metadata) | Stock age in days |
| Purchase Date | (metadata) | Original purchase date |
| GRC No | BarcodeLabel.grcNo | Goods receipt number |
| Supplier Invoice No | (metadata) | Supplier invoice |
| Batch/Unique | BarcodeLabel.batchUnique | Batch or unique identifier |
| Item Name | Item.name | Item name |
| Print Description | BarcodeLabel.printDescription | Print description |
| Item Code (col 15) | Item.itemCode | Duplicate - should match col 4 |
| Item Attributes | (custom) | Item attributes (if supported) |
| HSN | Hsn.code | HSN code |
| hsr pur price | **NEW FIELD** | HSR-specific purchase price |
| GST % | Tax.igst or HSN taxSlabs | GST percentage |
| RSP | Item.rsp or BarcodeLabel.retailPrice | Retail selling price |
| Discount % | Item.rspOfferPercent | Discount percentage |
| RSP Offer Price | BarcodeLabel.offerPrice | Offer price |
| WSP | Item.wsp or BarcodeLabel.wspPrice | Wholesale price |
| DP | BarcodeLabel.dpPrice | E-commerce price |
| Open Qty | BarcodeLabel.qtyNum | Stock quantity |
| UOM | Uom.shortName or name | Unit of measurement |
| Open Value | (calculated) | qty * price (should match hsr pur price * Open Qty) |

## Design Decisions

### 1. HSR Purchase Price Handling

**Problem:** The workbook contains `hsr pur price` which is warehouse-specific. The existing `BarcodeLabel.purRate` is a single field per barcode.

**Options:**
A. Add a new field `hsrPurRate` to `BarcodeLabel` schema
B. Store in `customFields` object
C. Use existing `purRate` and document that it represents HSR price for this import
D. Create a separate warehouse-price mapping collection

**Decision:** Option A - Add `hsrPurRate` field to `BarcodeLabel` schema
- Reason: Explicit, queryable, indexed, follows existing pattern
- Migration: Add field with default null (backward compatible)

### 2. Warehouse-Specific Import Scope

**Problem:** The workbook represents HSR opening stock, but barcodes may exist at TEMPLE FABRICS WAREHOUSE.

**Operations:**
1. **HSR Opening Stock** - Initialize HSR stock without transferring from source
2. **Warehouse Transfer** - Actual transfer from TEMPLE FABRICS WAREHOUSE to HSR
3. **Stock Replacement** - Set HSR stock to workbook quantity
4. **Import to Selected Warehouse** - Treat workbook as desired balance for any warehouse

**Decision:** All four operations will be supported, with explicit user selection.

### 3. Master Data Resolution

**Strategy:** Reuse existing `masterCache` pattern from `barcodeReportImportService.js`

**Resolution Rules:**
- **Item:** Match by itemCode first, then by name (normalized)
- **ProductGroup:** Match by name + parentId (null for top-level)
- **Supplier:** Match by contactId first, then by businessName (normalized)
- **HSN:** Match by code (exact)
- **UOM:** Match by shortName or name (normalized, case-insensitive)
- **Tax:** Match by igst percentage, preferring HSN's taxSlabs
- **Location:** Match by name within business scope
- **StockPoint:** Match by name within location scope

**Missing Masters:**
- Display explicit error/warning
- Provide link to create master
- Do NOT auto-create masters
- Allow re-import after masters are created

### 4. Import Operations

#### Operation A: Update Barcode/Item Details
- Match existing barcode/item
- Update selected fields (description, HSN, pricing)
- Do NOT change stock quantities
- Do NOT create duplicate barcodes

#### Operation B: Add New Barcodes
- Validate barcode uniqueness
- Resolve required masters
- Create barcode records through existing `BarcodeLabel` creation
- Stock creation only if explicitly selected (opening stock)

#### Operation C: Replace Stock Quantities
- Show warning: "Stock replacement will change existing quantity"
- Display before/after comparison
- Use existing inventory adjustment (ADJUST_IN/ADJUST_OUT)
- Target: specific warehouse + financial year

#### Operation D: Add Stock / Opening Stock
- Use existing GRC_IN mechanism or ADJUST_IN
- Record quantity, UOM, cost basis, source document
- Prevent duplicate opening stock on re-import
- Show expected final stock

#### Operation E: Transfer Stock Between Warehouses
- Use existing `StockTransfer` document
- Validate source stock availability
- Deduct from source, credit to destination
- Follow existing transfer approval rules

### 5. Duplicate "Item Code" Header

**Problem:** Workbook has "Item Code" in columns 4 and 15.

**Solution:**
- Column 4: Primary item code (use for matching)
- Column 15: Secondary item code (verify matches column 4, warn if different)
- Treat as validation check, not separate data

### 6. Date and Age Handling

**Decision:**
- Preserve valid source dates as-is
- Store Date, Purchase Date as metadata in `customFields`
- Age (days) stored as metadata
- Do NOT derive dates from Age unless business rule requires
- Report conflicts between Date and Age

### 7. Price Validation

**Checks:**
- Verify `Open Value ≈ hsr pur price * Open Qty`
- Report discrepancies > 1%
- Do NOT auto-calculate or override
- Flag for user review

### 8. UI Workflow

**Enhanced Flow:**
1. Upload Excel file
2. Analyse workbook (worksheets, headers, data types, row counts)
3. Resolve masters (match against database, identify missing)
4. Select import operation (A, B, C, D, or E)
5. Select target warehouse/financial year
6. Review stock and price differences
7. Correct errors/missing masters
8. Preview changes (before/after comparison)
9. Confirm with toggles (safe bulk-import controls)
10. Execute import (transactional)
11. Verify results
12. Download report

## Implementation Plan

### Phase 1: Schema Extension
1. Add `hsrPurRate` field to `BarcodeLabel` schema
2. Add migration script (backward compatible)
3. Update indexes if needed

### Phase 2: Excel Parser Extension
1. Extend `lib/barcodeReportImport.js` with HSR-specific field definitions
2. Handle duplicate "Item Code" header
3. Add data type preservation (leading zeros, dates)
4. Add validation for price/quantity consistency

### Phase 3: Master Resolution Enhancement
1. Extend `lib/barcodeReportImportService.js` masterCache
2. Add HSR-specific master resolution rules
3. Add warehouse/stock point resolution
4. Add missing master detection and reporting

### Phase 4: Operation Selection UI
1. Add operation selection step to `BarcodeReportImport.jsx`
2. Add warehouse/financial year selection
3. Add operation-specific warnings and guidance

### Phase 5: Reconciliation Engine
1. Implement workbook analysis (before database operations)
2. Implement stock comparison (existing vs Excel)
3. Implement price comparison (existing vs HSR price)
4. Implement warehouse transfer validation
5. Generate detailed preview with counts

### Phase 6: Backend API
1. Extend `app/api/reports/barcode-report/import/route.js`
2. Add operation-specific endpoints
3. Add validation for each operation
4. Add transaction support (already exists via `withTransaction`)

### Phase 7: Safe Bulk-Import Controls
1. Add toggles for each operation
2. Add confirmation dialogs
3. Add rollback capability (transaction-based)
4. Add import history tracking

### Phase 8: Testing
1. Test with actual HSR workbook (dry run)
2. Test each operation type
3. Test edge cases (missing masters, duplicates, conflicts)
4. Test rollback on errors
5. Test re-import scenarios

## Technical Specifications

### Excel Column-to-Model Mapping (Detailed)

```javascript
const HSR_IMPORT_FIELDS = [
  { key: 'group', label: 'Group Name', target: 'ProductGroup', targetField: 'name', resolveAs: 'parentGroup' },
  { key: 'subGroup', label: 'Sub Group Name', target: 'ProductGroup', targetField: 'name', resolveAs: 'subGroup' },
  { key: 'itemCode', label: 'Item Code', target: 'Item', targetField: 'itemCode', isPrimary: true },
  { key: 'supplierCode', label: 'Supplier Code', target: 'Supplier', targetField: 'contactId' },
  { key: 'supplierName', label: 'Supplier Name', target: 'Supplier', targetField: 'businessName' },
  { key: 'grcNo', label: 'GRC No', target: 'BarcodeLabel', targetField: 'grcNo' },
  { key: 'batchUnique', label: 'Batch/Unique', target: 'BarcodeLabel', targetField: 'batchUnique' },
  { key: 'itemName', label: 'Item Name', target: 'Item', targetField: 'name' },
  { key: 'printDescription', label: 'Print Description', target: 'BarcodeLabel', targetField: 'printDescription' },
  { key: 'hsn', label: 'HSN', target: 'Hsn', targetField: 'code' },
  { key: 'hsrPurPrice', label: 'hsr pur price', target: 'BarcodeLabel', targetField: 'hsrPurRate', type: 'number' },
  { key: 'gst', label: 'GST %', target: 'Tax', targetField: 'igst', type: 'number' },
  { key: 'rsp', label: 'RSP', target: 'Item', targetField: 'rsp', type: 'number' },
  { key: 'discount', label: 'Discount %', target: 'Item', targetField: 'rspOfferPercent', type: 'number' },
  { key: 'offerPrice', label: 'RSP Offer Price', target: 'BarcodeLabel', targetField: 'offerPrice', type: 'number' },
  { key: 'wsp', label: 'WSP', target: 'Item', targetField: 'wsp', type: 'number' },
  { key: 'dp', label: 'DP', target: 'BarcodeLabel', targetField: 'dpPrice', type: 'number' },
  { key: 'openQty', label: 'Open Qty', target: 'BarcodeLabel', targetField: 'qtyNum', type: 'number' },
  { key: 'uom', label: 'UOM', target: 'Uom', targetField: 'shortName' },
  { key: 'openValue', label: 'Open Value', target: 'calculated', type: 'number' },
];
```

### Import Operation Types

```javascript
const IMPORT_OPERATIONS = {
  UPDATE_DETAILS: 'UPDATE_DETAILS',
  ADD_BARCODES: 'ADD_BARCODES',
  REPLACE_STOCK: 'REPLACE_STOCK',
  ADD_STOCK: 'ADD_STOCK',
  TRANSFER_STOCK: 'TRANSFER_STOCK',
};
```

### API Endpoints

```
POST /api/reports/barcode-report/import/analyze
  Body: { file, operation, sourceWarehouse, targetWarehouse, finYear }
  Response: { analysis, masters, validation, preview }

POST /api/reports/barcode-report/import/execute
  Body: { operation, records, scope, options }
  Response: { result, summary, errors }
```

## Validation Rules

### Row-Level Validation
- Required fields: Item Code, Open Qty, UOM, HSN
- Numeric fields: qty > 0, prices >= 0, GST 0-40
- HSN: 2-8 digits
- UOM: must exist in UOM master
- Item Code consistency: col 4 must match col 15

### Master Validation
- Item: must exist or be marked missing
- Supplier: must exist or be marked missing
- Group/SubGroup: must exist or be marked missing
- HSN: must exist or be marked missing
- UOM: must exist
- Location: must exist and be within business scope
- StockPoint: must exist within selected location

### Stock Validation
- For transfer: source stock >= transfer quantity
- For replacement: show before/after quantities
- For opening stock: check for duplicate imports (same file hash)

### Price Validation
- Open Value ≈ hsr pur price * Open Qty (tolerance 1%)
- Report discrepancies
- Do not auto-correct

## Error Handling

### Error Categories
1. **Fatal Errors** - Stop import immediately
   - Invalid file format
   - Corrupted workbook
   - Missing required columns

2. **Row Errors** - Skip row, continue with rest
   - Invalid numeric values
   - Missing required masters
   - Duplicate barcode within workbook

3. **Warnings** - Flag for review, continue
   - Price value discrepancies
   - Date/Age conflicts
   - Duplicate Item Code values

4. **Informational** - Log, no action needed
   - Missing optional fields
   - Normalized values

### Error Response Format
```javascript
{
  success: false,
  error: {
    code: 'ROW_VALIDATION_ERROR',
    message: 'Row 15: Invalid quantity',
    row: 15,
    field: 'openQty',
    value: '-5',
    details: 'Quantity must be greater than 0'
  }
}
```

## Import History Tracking

### Import Job Schema (New Collection)
```javascript
{
  jobId: String,
  businessId: ObjectId,
  locationId: ObjectId,
  operation: String,
  fileName: String,
  fileHash: String,
  rowCount: Number,
  status: String, // PENDING, RUNNING, COMPLETED, FAILED, PARTIAL
  startedAt: Date,
  completedAt: Date,
  result: {
    total: Number,
    inserted: Number,
    updated: Number,
    replaced: Number,
    skipped: Number,
    failed: Number
  },
  errors: Array,
  warnings: Array,
  userId: ObjectId,
  scope: {
    sourceWarehouse: ObjectId,
    targetWarehouse: ObjectId,
    finYear: String
  }
}
```

## Rollback Strategy

### Transaction-Based Rollback
- All operations wrapped in `withTransaction`
- On error, entire transaction rolls back
- No partial writes

### Manual Rollback (Post-Import)
- Import job record tracks all changes
- Can reverse operations based on jobId
- For opening stock: create GRC_VOID or ADJUST_OUT
- For transfers: create return transfer

## Testing Strategy

### Test Cases
1. All masters exist, all barcodes new
2. All masters exist, some barcodes exist
3. Some masters missing, require creation
4. Duplicate Item Code values in workbook
5. Price value discrepancies
6. Stock quantity conflicts
7. Source warehouse insufficient stock for transfer
8. Re-import of same file (idempotency)
9. Large file (20,000+ rows) performance
10. Multiple operations on same dataset

### Test Environment
- Development/staging database
- No production writes
- Dry-run mode available

## Performance Considerations

### Batch Processing
- Process records in batches of 500
- Use bulk MongoDB operations where possible
- Keep master resolution cache in memory

### Memory Management
- Stream Excel file (don't load entirely)
- Process rows incrementally
- Clear cache between batches

### Transaction Timeout
- Large imports may exceed default transaction timeout
- Implement checkpoint/recovery mechanism
- Consider background job queue for very large files

## Security Considerations

### Permission Checks
- User must have BARCODE_GENERATE permission
- User must have access to target location
- User must have access to source location (for transfers)

### Input Validation
- All user inputs validated server-side
- File type validation (xlsx, xls, csv only)
- File size limits
- Row count limits (configurable)

### Audit Trail
- Every import job logged
- User who initiated import
- Timestamp for each operation
- Changes before/after recorded

## Future Enhancements

1. **Scheduled Imports** - Recurring imports from same template
2. **API-Based Imports** - Programmatic import without UI
3. **Import Templates** - Save and reuse import configurations
4. **Advanced Validation Rules** - Custom business rules
5. **Multi-File Imports** - Import from multiple workbooks
6. **Real-time Progress** - WebSocket progress updates for large files
7. **Export Template** - Generate blank template with correct headers
8. **Import Preview API** - Shareable preview links

## Conclusion

This design extends the existing Barcode Report Import system to support HSR opening stock imports while maintaining:
- Backward compatibility
- Existing business logic
- Transactional integrity
- Master data integrity
- User safety through previews and confirmations

The implementation will be incremental, with each phase tested independently before proceeding to the next.
