/**
 * Centralized Permission Registry for Master Stock Report (`/admin/report/master-stock-report`).
 *
 * Pure module (safe for both Next.js client components and server routes).
 * Every filter, range bound, table column, summary aggregate, and drill-down has
 * a stable key. Newly registered keys default to RESTRICTED for all non-Super-Admin
 * roles unless explicitly granted in RolePermission.masterStockFields.
 */

export const MASTER_STOCK_PERMISSION_GROUPS = [
  {
    key: 'scopeDate',
    title: 'Scope & Date Filters',
    items: [
      { key: 'masterStock.filters.locationFilter', label: 'Location', kind: 'filter', params: ['locationFilter', 'allLocations'] },
      { key: 'masterStock.filters.startDate', label: 'From Date', kind: 'filter', params: ['startDate'] },
      { key: 'masterStock.filters.endDate', label: 'To Date', kind: 'filter', params: ['endDate'] },
      { key: 'masterStock.filters.search', label: 'Search Query', kind: 'filter', params: ['search'] },
    ],
  },
  {
    key: 'basicFilters',
    title: 'Basic Filters',
    items: [
      { key: 'masterStock.filters.barcodeNumber', label: 'Barcode Number', kind: 'filter', params: ['barcodeNo'] },
      { key: 'masterStock.filters.groupName', label: 'Group Name', kind: 'filter', params: ['groupName'] },
      { key: 'masterStock.filters.itemCode', label: 'Item Code', kind: 'filter', params: ['itemId', 'itemCode'] },
      { key: 'masterStock.filters.hsn', label: 'HSN', kind: 'filter', params: ['hsn'] },
      { key: 'masterStock.filters.gst', label: 'GST %', kind: 'filter', params: ['gst'] },
    ],
  },
  {
    key: 'supplierInventoryFilters',
    title: 'Supplier & Inventory Filters',
    items: [
      { key: 'masterStock.filters.agent', label: 'Agent', kind: 'filter', params: ['agentId'] },
      { key: 'masterStock.filters.city', label: 'City', kind: 'filter', params: ['city'] },
      { key: 'masterStock.filters.supplierName', label: 'Supplier Name', kind: 'filter', params: ['supplierId'] },
      { key: 'masterStock.filters.uom', label: 'UOM', kind: 'filter', params: ['uom'] },
    ],
  },
  {
    key: 'priceFilters',
    title: 'Price Filters',
    items: [
      { key: 'masterStock.filters.rspStart', label: 'RSP — Start', kind: 'filter', params: ['rspMin'] },
      { key: 'masterStock.filters.rspEnd', label: 'RSP — End', kind: 'filter', params: ['rspMax'] },
      { key: 'masterStock.filters.rspOfferPriceStart', label: 'RSP Offer Price — Start', kind: 'filter', params: ['rspOfferPriceMin'] },
      { key: 'masterStock.filters.rspOfferPriceEnd', label: 'RSP Offer Price — End', kind: 'filter', params: ['rspOfferPriceMax'] },
      { key: 'masterStock.filters.wspStart', label: 'WSP — Start', kind: 'filter', params: ['wspMin'] },
      { key: 'masterStock.filters.wspEnd', label: 'WSP — End', kind: 'filter', params: ['wspMax'] },
      { key: 'masterStock.filters.ecomStart', label: 'E-Com Price — Start', kind: 'filter', params: ['ecomMin'] },
      { key: 'masterStock.filters.ecomEnd', label: 'E-Com Price — End', kind: 'filter', params: ['ecomMax'] },
      { key: 'masterStock.filters.ageStart', label: 'Age (Days) — Start', kind: 'filter', params: ['ageMin'] },
      { key: 'masterStock.filters.ageEnd', label: 'Age (Days) — End', kind: 'filter', params: ['ageMax'] },
      { key: 'masterStock.filters.costPriceStart', label: 'Cost Price — Start', kind: 'filter', params: ['costPriceMin'] },
      { key: 'masterStock.filters.costPriceEnd', label: 'Cost Price — End', kind: 'filter', params: ['costPriceMax'] },
      { key: 'masterStock.filters.discount', label: 'Discount %', kind: 'filter', params: ['discount'] },
    ],
  },
  {
    key: 'barcodePatternFilters',
    title: 'Barcode Pattern Filters',
    items: [
      { key: 'masterStock.filters.patternSupplierNo', label: 'Supplier Number', kind: 'filter', params: ['patternSupplierNo'] },
      { key: 'masterStock.filters.patternGrcNo', label: 'GRC Number', kind: 'filter', params: ['patternGrcNo'] },
      { key: 'masterStock.filters.patternSlNo', label: 'SL Number', kind: 'filter', params: ['patternSlNo'] },
      { key: 'masterStock.filters.patternQty', label: 'Quantity', kind: 'filter', params: ['patternQty'] },
    ],
  },
  {
    key: 'columns',
    title: 'Report Table Columns',
    items: [
      { key: 'masterStock.columns.groupName', label: 'Group Name', kind: 'column', columnKey: 'groupName' },
      { key: 'masterStock.columns.itemName', label: 'Item Name', kind: 'column', columnKey: 'itemName' },
      { key: 'masterStock.columns.supplierCode', label: 'Supplier Code', kind: 'column', columnKey: 'supplierCode' },
      { key: 'masterStock.columns.supplierName', label: 'Supplier Name', kind: 'column', columnKey: 'supplierName' },
      { key: 'masterStock.columns.date', label: 'Date', kind: 'column', columnKey: 'date' },
      { key: 'masterStock.columns.age', label: 'Age', kind: 'column', columnKey: 'age' },
      { key: 'masterStock.columns.barcodeNumber', label: 'Barcode Number', kind: 'column', columnKey: 'barcodeNumber' },
      { key: 'masterStock.columns.closeQty', label: 'Close Qty', kind: 'column', columnKey: 'closeQty' },
      { key: 'masterStock.columns.closeValue', label: 'Close Value', kind: 'column', columnKey: 'closeValue' },
      { key: 'masterStock.columns.costPrice', label: 'Cost Price', kind: 'column', columnKey: 'costPrice' },
      { key: 'masterStock.columns.hsn', label: 'HSN', kind: 'column', columnKey: 'hsn' },
      { key: 'masterStock.columns.gst', label: 'GST %', kind: 'column', columnKey: 'gst' },
      { key: 'masterStock.columns.rsp', label: 'RSP', kind: 'column', columnKey: 'rsp' },
      { key: 'masterStock.columns.discount', label: 'Discount %', kind: 'column', columnKey: 'discount' },
      { key: 'masterStock.columns.rspOfferPrice', label: 'RSP Offer Price', kind: 'column', columnKey: 'rspOfferPrice' },
      { key: 'masterStock.columns.wsp', label: 'WSP', kind: 'column', columnKey: 'wsp' },
      { key: 'masterStock.columns.ecom', label: 'E-Com', kind: 'column', columnKey: 'ecom' },
      { key: 'masterStock.columns.uom', label: 'UOM', kind: 'column', columnKey: 'uom' },
      { key: 'masterStock.columns.image', label: 'Image', kind: 'column', columnKey: 'imageUrl' },
    ],
  },
  {
    key: 'summary',
    title: 'Totals, Summary & Valuation',
    items: [
      { key: 'masterStock.summary.totalBarcodeCount', label: 'Total Barcode Count', kind: 'summary' },
      { key: 'masterStock.summary.totalRecords', label: 'Total Records', kind: 'summary' },
      { key: 'masterStock.summary.stockQuantity', label: 'Total Stock Quantity', kind: 'summary' },
      { key: 'masterStock.summary.stockValue', label: 'Total Stock Value / Close Value', kind: 'summary' },
      { key: 'masterStock.summary.costValue', label: 'Cost Value', kind: 'summary' },
    ],
  },
  {
    key: 'drilldowns',
    title: 'Drill-Downs & Detail Modals',
    items: [
      { key: 'masterStock.drilldowns.itemDetails', label: 'Item Details Modal', kind: 'drilldown' },
      { key: 'masterStock.drilldowns.supplierDetails', label: 'Supplier Details Modal', kind: 'drilldown' },
      { key: 'masterStock.drilldowns.barcodeReport', label: 'Barcode Report Link', kind: 'drilldown' },
      { key: 'masterStock.drilldowns.missingImages', label: 'Missing Images Export', kind: 'drilldown' },
    ],
  },
];

export const MASTER_STOCK_ITEMS = MASTER_STOCK_PERMISSION_GROUPS.flatMap((g) => g.items);
export const MASTER_STOCK_ALL_KEYS = MASTER_STOCK_ITEMS.map((item) => item.key);
export const MASTER_STOCK_KEY_SET = new Set(MASTER_STOCK_ALL_KEYS);

/* Maps query/draft filter keys (e.g. 'barcodeNo', 'costPriceMin') -> permission key */
export const MASTER_STOCK_FILTER_PERM = Object.freeze(
  MASTER_STOCK_ITEMS.reduce((acc, item) => {
    if (item.kind === 'filter' && Array.isArray(item.params)) {
      item.params.forEach((p) => { acc[p] = { key: item.key, label: item.label }; });
    }
    return acc;
  }, {}),
);

/* Maps table column key (`c.k` in REPORT.sections[0].columns) -> permission key */
export const MASTER_STOCK_COLUMN_PERM = Object.freeze(
  MASTER_STOCK_ITEMS.reduce((acc, item) => {
    if (item.kind === 'column' && item.columnKey) {
      acc[item.columnKey] = { key: item.key, label: item.label };
    }
    return acc;
  }, {}),
);

/* Maps /api/options?ref=... -> required masterStock.filters.* key when caller only has Master Stock Report access */
export const MASTER_STOCK_OPTION_REF_PERM = Object.freeze({
  supplier: 'masterStock.filters.supplierName',
  'supplier-code': 'masterStock.filters.patternSupplierNo',
  agent: 'masterStock.filters.agent',
  'grc-number': 'masterStock.filters.patternGrcNo',
  uom: 'masterStock.filters.uom',
  item: 'masterStock.filters.itemCode',
  'item-code': 'masterStock.filters.itemCode',
  'product/group': 'masterStock.filters.groupName',
  citygroup: 'masterStock.filters.supplierName',
});

export function cleanMasterStockFields(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const k of raw) {
    const key = String(k || '').trim();
    if (MASTER_STOCK_KEY_SET.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Default Master Stock field permissions when a role has NOT been customized yet
 * (or when resetting to defaults). Restricted/cashier/custom roles start with []
 * (nothing granted by default); Admin & Location Manager defaults cover their role reach.
 */
export function defaultMasterStockFieldsForRole(role) {
  if (role === 'Super Admin' || role === 'Admin' || role === 'Location Manager') {
    return [...MASTER_STOCK_ALL_KEYS];
  }
  return [];
}

/**
 * Resolve effective Master Stock permission state from `{ role, governed, masterStock }`
 * returned by effectivePermissions() / `/api/my-permissions`.
 */
export function resolveMasterStockPolicy({ role, governed, docHasFieldArray, savedFields } = {}) {
  if (role === 'Super Admin') {
    return { unrestricted: true, fields: [...MASTER_STOCK_ALL_KEYS] };
  }
  if (!governed) {
    if (role === 'Admin' || role === 'Location Manager') {
      return { unrestricted: false, fields: [...MASTER_STOCK_ALL_KEYS] };
    }
    return { unrestricted: false, fields: [] };
  }
  if (docHasFieldArray) {
    return { unrestricted: false, fields: cleanMasterStockFields(savedFields) };
  }
  /* Legacy RolePermission doc saved before field-level permissions existed:
     Admin keeps full current fields; all other roles fail closed (restricted until saved). */
  if (role === 'Admin') {
    return { unrestricted: false, fields: [...MASTER_STOCK_ALL_KEYS] };
  }
  return { unrestricted: false, fields: [] };
}

export function hasMasterStockPerm(policy, permKey) {
  if (!permKey) return true;
  if (!policy) return false;
  if (policy.unrestricted) return true;
  return Array.isArray(policy.fields) && policy.fields.includes(permKey);
}

export function allowedMasterStockFilterKey(filterKey) {
  return MASTER_STOCK_FILTER_PERM[filterKey]?.key || null;
}

export function allowedMasterStockColumnKey(colKey) {
  return MASTER_STOCK_COLUMN_PERM[colKey]?.key || null;
}
