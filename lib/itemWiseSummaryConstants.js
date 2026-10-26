/* Shared definitions for the "Item Wise Summary" opening-stock import.

   No server-only imports here: the browser renders the wizard from these
   labels, the server parses and writes with the same keys.

   The workbook is the report the ERP already exports (or the "templete.xlsx"
   the operator fills in). The canonical template carries the 33 columns in
   the exact order the import requirement lists them. The reference export
   that is already in circulation carries two extra columns - Sub Group Name
   and Item Name - and no Barcode column; both shapes are accepted, and
   nothing is renamed. */

export const ITEM_WISE_SHEET = 'Item Wise Summary';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 100000;

export const LAYOUTS = {
  TEMPLATE: 'TEMPLATE_33',
  REFERENCE: 'REFERENCE_34',
};

export const LAYOUT_LABELS = {
  [LAYOUTS.TEMPLATE]: 'Item Wise Summary template (33 columns, with Barcode)',
  [LAYOUTS.REFERENCE]: 'Item Wise Summary export (34 columns: Sub Group Name + Item Name, no Barcode)',
};

/* One entry per worksheet column. `role` drives the mapping, `format` the
   template cell format. Inserted columns live in the reference layout only. */
export const BASE_FIELDS = [
  { key: 'locationName', label: 'Location Name', role: 'location', type: 'text', width: 26, required: true },
  { key: 'groupName', label: 'Group Name', role: 'group', type: 'text', width: 22 },
  { key: 'supplierCode', label: 'Supplier Code', role: 'supplierCode', type: 'text', width: 16, format: 'TEXT' },
  { key: 'supplierName', label: 'Supplier Name', role: 'supplierName', type: 'text', width: 30 },
  { key: 'date', label: 'Date', role: 'stockDate', type: 'date', width: 14, format: 'DATE' },
  { key: 'age', label: 'Age', role: 'stockAge', type: 'integer', width: 10, format: 'INTEGER' },
  { key: 'purchaseDate', label: 'Purchase Date', role: 'purchaseDate', type: 'date', width: 14, format: 'DATE' },
  { key: 'grcNo', label: 'GRC No', role: 'grcNo', type: 'text', width: 16, format: 'TEXT' },
  { key: 'supplierInvoiceNo', label: 'Supplier Invoice No', role: 'supplierInvoiceNo', type: 'text', width: 20 },
  { key: 'batchUnique', label: 'Batch/Unique', role: 'batchType', type: 'text', width: 14 },
  { key: 'itemCode', label: 'Item Code', role: 'itemCode', type: 'text', width: 18, required: true, format: 'TEXT' },
  { key: 'printDescription', label: 'Print Description', role: 'printDescription', type: 'text', width: 30 },
  { key: 'barcode', label: 'Barcode', role: 'barcode', type: 'text', width: 22, format: 'TEXT' },
  { key: 'itemAttributes', label: 'Item Attributes', role: 'itemAttributes', type: 'text', width: 28 },
  { key: 'hsn', label: 'HSN', role: 'hsn', type: 'text', width: 12, format: 'TEXT' },
  { key: 'purRate', label: 'Purchase Rate', role: 'purRate', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'discount', label: 'Discount', role: 'discount', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'finalNet', label: 'Final Net Rate', role: 'finalNet', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'gst', label: 'GST %', role: 'gst', type: 'decimal', width: 10, format: 'DECIMAL' },
  { key: 'rsp', label: 'RSP', role: 'rsp', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'discountPercent', label: 'Discount %', role: 'discountPercent', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'offerPrice', label: 'RSP Offer Price', role: 'offerPrice', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'wsp', label: 'WSP', role: 'wsp', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'dp', label: 'DP', role: 'dp', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'openQty', label: 'Open Qty', role: 'openQty', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'uom', label: 'UOM', role: 'uom', type: 'text', width: 10, required: true },
  { key: 'openValue', label: 'Open Value', role: 'openValue', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'inwardQty', label: 'Inward Qty', role: 'inwardQty', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'inwardValue', label: 'Inward Value', role: 'inwardValue', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'outwardQty', label: 'Outward Qty', role: 'outwardQty', type: 'decimal', width: 12, format: 'DECIMAL' },
  { key: 'outwardValue', label: 'Outward Value', role: 'outwardValue', type: 'decimal', width: 14, format: 'DECIMAL' },
  { key: 'closeQty', label: 'Close Qty', role: 'closeQty', type: 'decimal', width: 12, format: 'DECIMAL', required: true },
  { key: 'closeValue', label: 'Close Value', role: 'closeValue', type: 'decimal', width: 14, format: 'DECIMAL' },
];

/* Columns the reference export carries that the canonical template does not. */
const REFERENCE_ONLY = {
  subGroupName: { key: 'subGroupName', label: 'Sub Group Name', role: 'subGroup', type: 'text', width: 22, after: 'groupName' },
  itemName: { key: 'itemName', label: 'Item Name', role: 'itemName', type: 'text', width: 30, after: 'batchUnique' },
};

function withReferenceColumns(fields) {
  const out = [];
  fields.forEach((field) => {
    out.push(field);
    if (field.key === 'groupName') out.push(REFERENCE_ONLY.subGroupName);
    if (field.key === 'batchUnique') out.push(REFERENCE_ONLY.itemName);
  });
  return out;
}

export const TEMPLATE_FIELDS = BASE_FIELDS;
/* The exported report has no Barcode column, carries Sub Group Name and Item
   Name, and prints Item Name / Print Description before Item Code - 34
   columns, all in the export's own order. */
function referenceBaseFields() {
  const fields = BASE_FIELDS.filter((field) => field.key !== 'barcode');
  const itemCode = fields.find((field) => field.key === 'itemCode');
  const withoutItemCode = fields.filter((field) => field.key !== 'itemCode');
  const printAt = withoutItemCode.findIndex((field) => field.key === 'printDescription');
  return [...withoutItemCode.slice(0, printAt + 1), itemCode, ...withoutItemCode.slice(printAt + 1)];
}

export const REFERENCE_FIELDS = withReferenceColumns(referenceBaseFields());

export const FIELDS_BY_LAYOUT = {
  [LAYOUTS.TEMPLATE]: TEMPLATE_FIELDS,
  [LAYOUTS.REFERENCE]: REFERENCE_FIELDS,
};

export const FIELD_BY_KEY = Object.fromEntries(
  [...BASE_FIELDS, REFERENCE_ONLY.subGroupName, REFERENCE_ONLY.itemName].map((f) => [f.key, f]),
);

export const STRATEGIES = {
  CREATE: 'CREATE_AND_IMPORT',
  EXISTING: 'EXISTING_ONLY',
  UPDATE: 'UPDATE_STOCK',
};

export const STRATEGY_LABELS = {
  [STRATEGIES.CREATE]: 'Create approved missing masters + import',
  [STRATEGIES.EXISTING]: 'Import using existing masters only',
  [STRATEGIES.UPDATE]: 'Update existing barcode stock',
};

export const STRATEGY_DESCRIPTIONS = {
  [STRATEGIES.CREATE]:
    'Creates only the missing masters you tick, resolves their real IDs, then creates barcode rows and opening stock. Existing barcodes are never recreated.',
  [STRATEGIES.EXISTING]:
    'Creates no masters and no updates. Rows whose supplier, item, HSN, group, sub group, UOM or location is missing are excluded and reported.',
  [STRATEGIES.UPDATE]:
    'Creates nothing. Only barcodes that already exist at the row\'s location are considered, and their quantity changes only when stock replacement is confirmed.',
};

export const ROW_STATUS = {
  READY: 'ready',
  EXISTING: 'existing',
  MISSING_MASTER: 'missing_master',
  INVALID: 'invalid',
  DUPLICATE: 'duplicate',
  ZERO_QTY: 'zero_qty',
  OTHER_LOCATION: 'other_location',
  NOT_EXISTING: 'not_existing',
};

export const ROW_STATUS_LABELS = {
  [ROW_STATUS.READY]: 'Ready to import',
  [ROW_STATUS.EXISTING]: 'Existing barcode',
  [ROW_STATUS.MISSING_MASTER]: 'Missing master',
  [ROW_STATUS.INVALID]: 'Invalid',
  [ROW_STATUS.DUPLICATE]: 'Duplicate',
  [ROW_STATUS.ZERO_QTY]: 'No stock (0 qty)',
  [ROW_STATUS.OTHER_LOCATION]: 'Exists at another location',
  [ROW_STATUS.NOT_EXISTING]: 'Barcode not found',
};

export const ROW_STATUS_TONES = {
  [ROW_STATUS.READY]: 'bg-okgreenbg text-okgreen',
  [ROW_STATUS.EXISTING]: 'bg-[#eef2f8] text-inkmuted',
  [ROW_STATUS.MISSING_MASTER]: 'bg-[#fff4df] text-[#9a6400]',
  [ROW_STATUS.INVALID]: 'bg-[#fdecec] text-danger',
  [ROW_STATUS.DUPLICATE]: 'bg-[#fdecec] text-danger',
  [ROW_STATUS.ZERO_QTY]: 'bg-[#eef2f8] text-inkmuted',
  [ROW_STATUS.OTHER_LOCATION]: 'bg-[#fdecec] text-danger',
  [ROW_STATUS.NOT_EXISTING]: 'bg-[#eef2f8] text-inkmuted',
};

export const MASTER_TYPES = {
  LOCATION: 'Location',
  GROUP: 'Group',
  SUB_GROUP: 'Sub Group',
  SUPPLIER: 'Supplier',
  ITEM: 'Item',
  HSN: 'HSN',
  UOM: 'UOM',
};

export const MASTER_SLUGS = {
  [MASTER_TYPES.LOCATION]: 'location',
  [MASTER_TYPES.GROUP]: 'group',
  [MASTER_TYPES.SUB_GROUP]: 'subGroup',
  [MASTER_TYPES.SUPPLIER]: 'supplier',
  [MASTER_TYPES.ITEM]: 'item',
  [MASTER_TYPES.HSN]: 'hsn',
  [MASTER_TYPES.UOM]: 'uom',
};

export const MASTER_TYPE_BY_SLUG = Object.fromEntries(
  Object.entries(MASTER_SLUGS).map(([type, slug]) => [slug, type]),
);

export const CREATABLE_MASTERS = new Set([
  MASTER_TYPES.GROUP, MASTER_TYPES.SUB_GROUP, MASTER_TYPES.SUPPLIER,
  MASTER_TYPES.ITEM, MASTER_TYPES.HSN, MASTER_TYPES.UOM,
]);

export const FILTERS = [
  { key: 'all', label: 'All rows' },
  { key: ROW_STATUS.READY, label: 'Ready' },
  { key: ROW_STATUS.MISSING_MASTER, label: 'Missing master' },
  { key: ROW_STATUS.INVALID, label: 'Invalid' },
  { key: ROW_STATUS.DUPLICATE, label: 'Duplicate' },
  { key: ROW_STATUS.EXISTING, label: 'Existing' },
  { key: ROW_STATUS.ZERO_QTY, label: 'Zero qty' },
];

export const ERROR_REPORT_COLUMNS = [
  'Original Row',
  'Barcode',
  'Item Code',
  'Supplier Code',
  'Field',
  'Uploaded Value',
  'Error',
  'Suggested Correction',
  'Status',
];

export const IMPORT_SOURCE = 'ITEM_WISE_SUMMARY_EXCEL';
export const JOB_OPERATION = 'ITEM_WISE_SUMMARY_IMPORT';
