/* Shared definitions for the Barcode + Master Data import.

   NO server-only imports here: the browser uses these labels to render the
   wizard, the server uses the same keys to parse and write. */

export const IMPORT_SCOPES = {
  BARCODE_MASTER: 'BARCODE_MASTER',
  BARCODE_STOCK: 'BARCODE_STOCK',
  MASTER_DATA: 'MASTER_DATA',
};

export const IMPORT_SCOPE_LABELS = {
  [IMPORT_SCOPES.BARCODE_MASTER]: 'Barcode + Master Data Import',
  [IMPORT_SCOPES.BARCODE_STOCK]: 'Barcode / Stock Update',
  [IMPORT_SCOPES.MASTER_DATA]: 'Master Data Import',
};

export const IMPORT_SCOPE_DESCRIPTIONS = {
  [IMPORT_SCOPES.BARCODE_MASTER]: 'Create missing masters, then create new barcode and opening-stock records from the workbook.',
  [IMPORT_SCOPES.BARCODE_STOCK]: 'Update the stock quantity of barcodes that already exist. Nothing new is created.',
  [IMPORT_SCOPES.MASTER_DATA]: 'Create only the master records listed on the Master Data sheet.',
};

export const IMPORT_STRATEGIES = {
  CREATE_AND_IMPORT: 'CREATE_AND_IMPORT',
  EXISTING_ONLY: 'EXISTING_ONLY',
  UPDATE_STOCK: 'UPDATE_STOCK',
};

export const IMPORT_STRATEGY_LABELS = {
  [IMPORT_STRATEGIES.CREATE_AND_IMPORT]: 'Create missing masters + import barcodes',
  [IMPORT_STRATEGIES.EXISTING_ONLY]: 'Import using existing masters only',
  [IMPORT_STRATEGIES.UPDATE_STOCK]: 'Update existing barcode stock',
};

export const IMPORT_STRATEGY_DESCRIPTIONS = {
  [IMPORT_STRATEGIES.CREATE_AND_IMPORT]:
    'Creates only the valid, explicitly listed master records, resolves their real IDs, then imports new barcode rows. Existing barcodes are left untouched.',
  [IMPORT_STRATEGIES.EXISTING_ONLY]:
    'Creates nothing. Rows whose supplier, item, HSN, group, UOM or location is missing are excluded and reported.',
  [IMPORT_STRATEGIES.UPDATE_STOCK]:
    'Creates nothing. Only barcodes that already exist are considered, and their stock quantity changes only when replacement is explicitly selected.',
};

export const STRATEGIES_BY_SCOPE = {
  [IMPORT_SCOPES.BARCODE_MASTER]: [IMPORT_STRATEGIES.CREATE_AND_IMPORT, IMPORT_STRATEGIES.EXISTING_ONLY],
  [IMPORT_SCOPES.BARCODE_STOCK]: [IMPORT_STRATEGIES.UPDATE_STOCK],
  [IMPORT_SCOPES.MASTER_DATA]: [],
};

export const SHEET_NAMES = {
  INSTRUCTIONS: 'Instructions',
  BARCODE: 'Barcode Import',
  MASTER: 'Master Data',
  REFERENCE: 'Existing Master Reference',
};

export const ROW_STATUS = {
  READY: 'ready',
  VALID: 'valid',
  INVALID: 'invalid',
  MISSING_MASTER: 'missing_master',
  EXISTING_BARCODE: 'existing_barcode',
  DUPLICATE: 'duplicate',
  EXAMPLE: 'example',
  IGNORED: 'ignored',
};

export const ROW_STATUS_LABELS = {
  [ROW_STATUS.READY]: 'Ready to import',
  [ROW_STATUS.VALID]: 'Valid',
  [ROW_STATUS.INVALID]: 'Invalid',
  [ROW_STATUS.MISSING_MASTER]: 'Missing master',
  [ROW_STATUS.EXISTING_BARCODE]: 'Existing barcode',
  [ROW_STATUS.DUPLICATE]: 'Duplicate',
  [ROW_STATUS.EXAMPLE]: 'Example row',
  [ROW_STATUS.IGNORED]: 'Ignored',
};

export const ROW_STATUS_TONES = {
  [ROW_STATUS.READY]: 'bg-okgreenbg text-okgreen',
  [ROW_STATUS.VALID]: 'bg-okgreenbg text-okgreen',
  [ROW_STATUS.INVALID]: 'bg-[#fdecec] text-danger',
  [ROW_STATUS.MISSING_MASTER]: 'bg-[#fff4df] text-[#9a6400]',
  [ROW_STATUS.EXISTING_BARCODE]: 'bg-[#eef2f8] text-inkmuted',
  [ROW_STATUS.DUPLICATE]: 'bg-[#fdecec] text-danger',
  [ROW_STATUS.EXAMPLE]: 'bg-[#eef2f8] text-inkmuted',
  [ROW_STATUS.IGNORED]: 'bg-[#eef2f8] text-inkmuted',
};

export const MASTER_TYPES = {
  SUPPLIER: 'Supplier',
  ITEM: 'Item',
  HSN: 'HSN',
  GROUP: 'Group',
  SUB_GROUP: 'Sub Group',
  UOM: 'UOM',
  LOCATION: 'Location',
  AGENT: 'Agent',
};

export const MASTER_TYPE_LIST = Object.values(MASTER_TYPES);

export const MASTER_TYPE_ALIASES = {
  supplier: MASTER_TYPES.SUPPLIER,
  vendor: MASTER_TYPES.SUPPLIER,
  item: MASTER_TYPES.ITEM,
  product: MASTER_TYPES.ITEM,
  hsn: MASTER_TYPES.HSN,
  hsncode: MASTER_TYPES.HSN,
  group: MASTER_TYPES.GROUP,
  productgroup: MASTER_TYPES.GROUP,
  subgroup: MASTER_TYPES.SUB_GROUP,
  subproductgroup: MASTER_TYPES.SUB_GROUP,
  uom: MASTER_TYPES.UOM,
  unit: MASTER_TYPES.UOM,
  unitofmeasure: MASTER_TYPES.UOM,
  location: MASTER_TYPES.LOCATION,
  branch: MASTER_TYPES.LOCATION,
  companylocation: MASTER_TYPES.LOCATION,
  agent: MASTER_TYPES.AGENT,
  salesperson: MASTER_TYPES.AGENT,
};

/* The Barcode Import sheet. `required` is what the import truly needs; the
   working columns beyond it are validated when filled, never invented. */
export const BARCODE_FIELDS = [
  { key: 'barcodeNo', label: 'Barcode Number', aliases: ['barcode', 'barcode no', 'barcode number', 'barcode no.'], type: 'text', required: true, width: 22, style: 'TEXT' },
  { key: 'oldBarcode', label: 'Old Barcode', aliases: ['old barcode', 'old barcode no', 'old code'], type: 'text', width: 18, style: 'TEXT' },
  { key: 'itemCode', label: 'Item Code', aliases: ['item code', 'itemcode', 'item code_1', 'item code 1', 'code'], type: 'text', required: true, width: 18, style: 'TEXT' },
  { key: 'itemName', label: 'Item Name', aliases: ['item name', 'item', 'product name'], type: 'text', width: 32 },
  { key: 'printDescription', label: 'Print Description', aliases: ['print description', 'description', 'label description'], type: 'text', width: 32 },
  { key: 'itemAttributes', label: 'Item Attributes', aliases: ['item attributes', 'attributes'], type: 'text', width: 30 },
  { key: 'hsn', label: 'HSN', aliases: ['hsn', 'hsn code'], type: 'text', width: 12, style: 'TEXT' },
  { key: 'supplierCode', label: 'Supplier Code', aliases: ['supplier code', 'suppliercode', 'vendor code'], type: 'text', width: 16, style: 'TEXT' },
  { key: 'supplierName', label: 'Supplier Name', aliases: ['supplier name', 'supplier', 'vendor name'], type: 'text', width: 30 },
  { key: 'agentCode', label: 'Agent Code', aliases: ['agent code', 'agentcode'], type: 'text', width: 14, style: 'TEXT' },
  { key: 'agentName', label: 'Agent Name', aliases: ['agent name', 'agent'], type: 'text', width: 24 },
  { key: 'grcNo', label: 'GRC Number', aliases: ['grc number', 'grc no', 'grc no.', 'grc'], type: 'text', width: 16, style: 'TEXT' },
  { key: 'supplierInvoiceNo', label: 'Supplier Invoice Number', aliases: ['supplier invoice number', 'supplier invoice no', 'invoice no', 'vendor doc no'], type: 'text', width: 18 },
  { key: 'batchUnique', label: 'Batch/Unique', aliases: ['batch/unique', 'batch unique', 'batch type'], type: 'text', width: 14 },
  { key: 'batchNo', label: 'Batch No', aliases: ['batch no', 'batch number'], type: 'text', width: 14, style: 'TEXT' },
  { key: 'serialNo', label: 'Serial No', aliases: ['serial no', 'serial number'], type: 'text', width: 12, style: 'TEXT' },
  { key: 'purchaseDate', label: 'Purchase Date', aliases: ['purchase date', 'pur date', 'bill date'], type: 'date', width: 14, style: 'DATE' },
  { key: 'stockDate', label: 'Date', aliases: ['date', 'stock date', 'as on date'], type: 'date', width: 14, style: 'DATE' },
  { key: 'age', label: 'Age', aliases: ['age', 'stock age'], type: 'integer', width: 10, style: 'INTEGER' },
  { key: 'purRate', label: 'Purchase Rate', aliases: ['purchase rate', 'pur rate', 'purrate', 'hsr pur price', 'hsr purchase price', 'purchase price'], type: 'decimal', width: 14, style: 'DECIMAL' },
  { key: 'disc', label: 'Discount', aliases: ['discount', 'disc'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'finalNet', label: 'Final Net Rate', aliases: ['final net rate', 'final net', 'net rate', 'final price'], type: 'decimal', width: 14, style: 'DECIMAL' },
  { key: 'gst', label: 'GST Percentage', aliases: ['gst percentage', 'gst %', 'gst', 'tax %'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'retailPrice', label: 'RSP', aliases: ['rsp', 'retail price', 'mrp'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'disc2', label: 'Discount Percentage', aliases: ['discount percentage', 'discount %', 'disc %', 'rsp discount %'], type: 'decimal', width: 14, style: 'DECIMAL' },
  { key: 'offerPrice', label: 'RSP Offer Price', aliases: ['rsp offer price', 'offer price', 'offer'], type: 'decimal', width: 14, style: 'DECIMAL' },
  { key: 'wspPrice', label: 'WSP', aliases: ['wsp', 'wholesale price'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'dpPrice', label: 'DP', aliases: ['dp', 'dealer price'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'locationName', label: 'Location Name', aliases: ['location name', 'location', 'branch'], type: 'text', width: 28 },
  { key: 'businessName', label: 'Company/Business', aliases: ['company/business', 'company', 'business'], type: 'text', width: 28 },
  { key: 'groupName', label: 'Group Name', aliases: ['group name', 'group'], type: 'text', width: 24 },
  { key: 'subGroupName', label: 'Sub Group Name', aliases: ['sub group name', 'subgroup name', 'sub group', 'subgroup'], type: 'text', width: 24 },
  { key: 'openingQty', label: 'Opening Quantity', aliases: ['opening quantity', 'open qty', 'opening qty', 'open quantity', 'qty', 'quantity'], type: 'decimal', required: true, width: 14, style: 'DECIMAL' },
  { key: 'uomName', label: 'UOM', aliases: ['uom', 'unit', 'unit of measure'], type: 'text', width: 12 },
  { key: 'openingValue', label: 'Opening Value', aliases: ['opening value', 'open value'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'inwardQty', label: 'Inward Quantity', aliases: ['inward qty', 'inward quantity'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'inwardValue', label: 'Inward Value', aliases: ['inward value'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'outwardQty', label: 'Outward Quantity', aliases: ['outward qty', 'outward quantity'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'outwardValue', label: 'Outward Value', aliases: ['outward value'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'closingQty', label: 'Closing Quantity', aliases: ['closing qty', 'close qty', 'closing quantity'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
  { key: 'closingValue', label: 'Closing Value', aliases: ['closing value', 'close value'], type: 'decimal', width: 14, style: 'DECIMAL', calculated: true },
];

export const BARCODE_FIELD_BY_KEY = Object.fromEntries(BARCODE_FIELDS.map((f) => [f.key, f]));

/* Only these fields become database columns. The calculated summary columns
   are read for reporting and then deliberately ignored. */
export const IGNORED_SUMMARY_FIELDS = ['openingValue', 'inwardQty', 'inwardValue', 'outwardQty', 'outwardValue', 'closingQty', 'closingValue'];

export const MASTER_FIELDS = [
  { key: 'masterType', label: 'Master Type', aliases: ['master type', 'type', 'master'], type: 'text', required: true, width: 16 },
  { key: 'code', label: 'Code', aliases: ['code', 'master code', 'short code'], type: 'text', width: 20, style: 'TEXT' },
  { key: 'name', label: 'Name', aliases: ['name', 'master name', 'business name'], type: 'text', width: 34 },
  { key: 'shortName', label: 'Short Name', aliases: ['short name', 'trade name'], type: 'text', width: 22 },
  { key: 'parent', label: 'Parent / Group', aliases: ['parent', 'parent group', 'group', 'group name', 'sub group'], type: 'text', width: 24 },
  { key: 'uomName', label: 'UOM', aliases: ['uom', 'unit'], type: 'text', width: 12 },
  { key: 'hsn', label: 'HSN', aliases: ['hsn', 'hsn code'], type: 'text', width: 12, style: 'TEXT' },
  { key: 'gst', label: 'GST Percentage', aliases: ['gst percentage', 'gst %', 'gst', 'tax %'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'description', label: 'Description', aliases: ['description', 'remarks'], type: 'text', width: 40 },
  { key: 'address', label: 'Address', aliases: ['address', 'address line 1'], type: 'text', width: 34 },
  { key: 'city', label: 'City', aliases: ['city', 'town'], type: 'text', width: 18 },
  { key: 'state', label: 'State', aliases: ['state'], type: 'text', width: 18 },
  { key: 'zipCode', label: 'Zip Code', aliases: ['zip code', 'zip', 'pincode', 'pin code'], type: 'text', width: 12, style: 'TEXT' },
  { key: 'mobile', label: 'Mobile', aliases: ['mobile', 'phone', 'contact number'], type: 'text', width: 16, style: 'TEXT' },
  { key: 'email', label: 'Email', aliases: ['email', 'email id'], type: 'text', width: 26 },
  { key: 'gstNo', label: 'GST No', aliases: ['gst no', 'gstin', 'gst number'], type: 'text', width: 20, style: 'TEXT' },
  { key: 'status', label: 'Status', aliases: ['status'], type: 'text', width: 12 },
  { key: 'effectiveDate', label: 'Effective Date', aliases: ['effective date'], type: 'date', width: 14, style: 'DATE' },
  { key: 'rsp', label: 'RSP', aliases: ['rsp', 'retail price'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'wsp', label: 'WSP', aliases: ['wsp', 'wholesale price'], type: 'decimal', width: 12, style: 'DECIMAL' },
  { key: 'itemType', label: 'Item Type', aliases: ['item type'], type: 'text', width: 14 },
  { key: 'prefix', label: 'Prefix', aliases: ['prefix'], type: 'text', width: 12 },
  { key: 'contactType', label: 'Contact Type', aliases: ['contact type', 'supplier type', 'agent type'], type: 'text', width: 18 },
];

export const MASTER_FIELD_BY_KEY = Object.fromEntries(MASTER_FIELDS.map((f) => [f.key, f]));

export const MASTER_REQUIRED = {
  [MASTER_TYPES.SUPPLIER]: ['name', 'contactType'],
  [MASTER_TYPES.AGENT]: ['name', 'contactType'],
  [MASTER_TYPES.ITEM]: ['code', 'name', 'parent', 'uomName', 'hsn'],
  [MASTER_TYPES.HSN]: ['code'],
  [MASTER_TYPES.GROUP]: ['name'],
  [MASTER_TYPES.SUB_GROUP]: ['name', 'parent'],
  [MASTER_TYPES.UOM]: ['code', 'name'],
  [MASTER_TYPES.LOCATION]: ['name', 'city', 'zipCode'],
};

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 50000;
export const PREVIEW_PAGE_SIZE = 50;
export const PREVIEW_ROW_LIMIT = 500;

export const FILTERS = [
  { key: 'all', label: 'All records' },
  { key: 'valid', label: 'Valid' },
  { key: 'invalid', label: 'Invalid' },
  { key: 'missing_master', label: 'Missing master' },
  { key: 'ambiguous', label: 'Ambiguous match' },
  { key: 'mapping_error', label: 'Mapping error' },
  { key: 'existing_barcode', label: 'Existing barcode' },
  { key: 'duplicate', label: 'Duplicate' },
  { key: 'ready', label: 'Ready to import' },
];

export const IMPORT_JOB_OPERATIONS = {
  [IMPORT_SCOPES.BARCODE_MASTER]: 'BARCODE_MASTER_IMPORT',
  [IMPORT_SCOPES.BARCODE_STOCK]: 'BARCODE_STOCK_UPDATE',
  [IMPORT_SCOPES.MASTER_DATA]: 'MASTER_DATA_IMPORT',
};

export const ERROR_REPORT_COLUMNS = [
  'Original Row',
  'Barcode Number',
  'Item Code',
  'Supplier Code',
  'Sheet',
  'Failed Field',
  'Uploaded Value',
  'Error',
  'Suggested Correction',
  'Status',
];
