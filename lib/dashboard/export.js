import * as XLSX from 'xlsx';

/* ==========================================================================
   Workbook for the "Download Full Report" action.

   The workbook is built from the exact payload returned by
   buildDashboardAnalytics(), so the file and the screen cannot disagree:
   there is no second query and no separate rounding rule here. Every figure
   is copied from the filtered analytics response.
   ========================================================================== */

const SHEET_LIMIT = 31;

function stamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

function money(value) {
  return Number.isFinite(Number(value)) ? Number(value) : '';
}

function pct(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? 'N/A' : Number(value);
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function addSheet(book, name, rows, widths = []) {
  const sheetName = String(name).slice(0, SHEET_LIMIT);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (widths.length) sheet['!cols'] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
}

function channelStatus(row) {
  if (row.available === false) return 'Source not available';
  return row.inScope ? 'In selected channel scope' : 'Shown for reconciliation';
}

function reconciliationRows(reconciliation) {
  if (!reconciliation) return [['Reconciliation', 'No reconciliation data returned']];
  const rows = [['Section', 'Metric', 'Value (INR / count)', 'Note']];
  const off = reconciliation.offline || {};
  const web = reconciliation.website || {};
  const insta = reconciliation.instagram || {};
  rows.push(
    ['Offline', 'POS invoices (gross)', money(off.posGross), ''],
    ['Offline', 'Sales invoices (gross)', money(off.salesGross), ''],
    ['Offline', 'POS returns', money(off.posReturns), 'Deducted'],
    ['Offline', 'Sales returns', money(off.salesReturns), 'Deducted'],
    ['Offline', 'Offline gross sales', money(off.sales), 'POS + sales invoices'],
    ['Offline', 'Offline total returns', money(off.returns), 'POS + sales returns'],
    ['Offline', 'Offline net revenue', money(off.net), 'Feeds the KPI cards'],
    ['Offline', 'Offline orders', money(off.orders), 'Return documents are not orders'],
    ['Offline', 'Return documents', money(off.returnDocuments), 'Distinct documents'],
    ['Website', 'Eligible storefront orders', money(web.eligible), 'Confirmed through delivered'],
    ['Website', 'Already invoiced in ERP', money(web.duplicatesExcluded), 'Excluded from revenue'],
    ['Website', 'Duplicate orders excluded', money(web.duplicateCount), 'Invoice-number match'],
    ['Website', 'Website net revenue', money(web.net), 'Feeds the KPI cards'],
    ['Website', 'Website orders', money(web.orders), ''],
    ['Instagram', 'Tagged invoices (gross)', money(insta.gross), 'Sales Channel saved at billing'],
    ['Instagram', 'Tagged returns', money(insta.returns), 'Deducted'],
    ['Instagram', 'Revenue', money(insta.net), 'Gross less tagged returns'],
    ['Instagram', 'Orders', money(insta.orders), 'Tagged invoices only'],
    ['Total', 'Net revenue', money(reconciliation.total), 'Offline + Instagram + website'],
    ['Total', 'Orders', money(reconciliation.totalOrders), 'Offline + Instagram + website'],
    ['Total', 'Reconciliation check', money(reconciliation.check), 'Expected 0'],
    ['Returns', 'Online returns', text(reconciliation.onlineReturns), 'Not tracked in the storefront']
  );
  return rows;
}

export function buildDashboardWorkbook(data) {
  const book = XLSX.utils.book_new();
  const meta = data?.meta || {};
  const cards = data?.kpis?.cards || [];

  /* ---------------------------------------------------------------- summary */
  const summary = [
    ['Retail ERP — Sales Analytics Report'],
    ['Generated at (IST)', stamp(meta.generatedAt)],
    ['Financial year', text(meta.financialYear)],
    ['Period', `${text(meta.startDate)} to ${text(meta.endDate)} (${text(meta.days)} days)`],
    ['Comparison', meta.comparison ? `${meta.comparison.startDate} to ${meta.comparison.endDate} (${meta.comparison.label})` : 'None'],
    ['Company', text(meta.companyLabel)],
    ['Branch', text(meta.branchLabel)],
    ['Channel', text(meta.channelLabel)],
    ['Timezone', text(meta.timezone)],
    ['Currency', text(meta.currency)],
    [],
    ['KPI', 'Current', 'Comparison', 'Change', 'Change type', 'Direction', 'Definition'],
  ];
  cards.forEach((card) => {
    summary.push([
      text(card.label),
      card.format === 'currency' ? money(card.value) : (card.value === null ? 'N/A' : card.value),
      card.format === 'currency' ? money(card.previousValue) : (card.previousValue === null ? 'N/A' : card.previousValue),
      card.change === null ? 'N/A' : card.change,
      text(card.changeType),
      text(card.direction),
      text(card.note),
    ]);
  });
  summary.push(
    [],
    ['Key takeaway', text(data?.keyTakeaway)],
    [],
    ['Source document counts', 'Value'],
    ['POS invoices', money(meta.sourceCounts?.posInvoices)],
    ['Sales invoices', money(meta.sourceCounts?.salesInvoices)],
    ['POS returns', money(meta.sourceCounts?.posReturns)],
    ['Sales returns', money(meta.sourceCounts?.salesReturns)],
    ['Website orders included', money(meta.sourceCounts?.websiteOrders)],
    ['Website orders excluded as duplicates', money(meta.sourceCounts?.websiteDuplicateOrders)],
    [],
    ['Branch scope'],
    ['Branch', 'City', 'Company', 'Main branch'],
    ...(meta.branchScope || []).map((b) => [text(b.branchName), text(b.city), text(b.businessName), b.isMainBranch ? 'Yes' : 'No'])
  );
  addSheet(book, 'Summary', summary, [38, 22, 22, 16, 16, 14, 70]);

  /* ------------------------------------------------------------------ trend */
  const trend = [
    ['Month', 'Net revenue (INR)', 'Orders', 'Partial month'],
    ...(data?.trend || []).map((row) => [text(row.label), money(row.revenue), money(row.orders), row.partial ? 'Yes' : 'No']),
  ];
  addSheet(book, 'Revenue Trend', trend, [18, 22, 12, 14]);

  /* ------------------------------------------------------------- categories */
  const categories = [
    ['Category', 'Net revenue (INR)', 'Share of revenue (%)'],
    ...(data?.categories || []).map((row) => [text(row.category), money(row.revenue), pct(row.share)]),
  ];
  addSheet(book, 'Categories', categories, [34, 22, 22]);

  /* --------------------------------------------------------------- products */
  const products = [
    ['Item code', 'Item name', 'Category', 'UOM', 'Units', 'Net revenue (INR)', 'Orders', 'Share (%)', 'Prior revenue (INR)', 'Growth (%)'],
    ...(data?.products || []).map((row) => [
      text(row.code), text(row.name), text(row.category), text(row.uom),
      money(row.units), money(row.revenue), money(row.orders), pct(row.share),
      money(row.previousRevenue), pct(row.growth),
    ]),
  ];
  addSheet(book, 'Top Products', products, [18, 42, 30, 10, 12, 20, 10, 12, 20, 12]);

  /* --------------------------------------------------------------- branches */
  const branches = [
    ['Branch', 'City', 'Main branch', 'Net revenue (INR)', 'Orders', 'Share (%)', 'Prior revenue (INR)', 'Prior orders', 'Growth (%)', 'AOV (INR)'],
    ...(data?.branches?.rows || []).map((row) => [
      text(row.branchName), text(row.city), row.isMainBranch ? 'Yes' : 'No',
      money(row.revenue), money(row.orders), pct(row.share),
      money(row.previousRevenue), money(row.previousOrders), pct(row.growth), money(row.aov),
    ]),
    [],
    ['Total', '', '', money(data?.branches?.totalRevenue), money(data?.branches?.totalOrders), 100, money(data?.branches?.previousRevenue), money(data?.branches?.previousOrders), '', ''],
  ];
  addSheet(book, 'Sales by Region', branches, [38, 18, 12, 20, 10, 12, 20, 12, 12, 16]);

  /* --------------------------------------------------------------- channels */
  const channels = [
    ['Channel', 'Status', 'Net revenue (INR)', 'Orders', 'Share (%)', 'Prior revenue (INR)', 'Prior orders', 'Growth (%)', 'Source note'],
    ...(data?.channels?.rows || []).map((row) => [
      text(row.label), channelStatus(row), money(row.revenue), money(row.orders), pct(row.share),
      money(row.previousRevenue), money(row.previousOrders), pct(row.growth), text(row.note),
    ]),
    [],
    ['Total', '', money(data?.channels?.totalRevenue), money(data?.channels?.totalOrders), 100, money(data?.channels?.previousRevenue), money(data?.channels?.previousOrders), pct(data?.channels?.growth), ''],
  ];
  addSheet(book, 'Channel Performance', channels, [24, 24, 20, 10, 12, 20, 12, 12, 75]);

  addSheet(book, 'Reconciliation', reconciliationRows(data?.reconciliation), [16, 34, 22, 52]);

  /* --------------------------------------------------------------- forecast */
  const forecast = data?.forecast || {};
  const forecastRows = [
    ['Forecast & recommendations'],
    ['Type', 'Value', 'Basis / note'],
    ['Forecast available', forecast.available ? 'Yes' : 'No', text(forecast.reason)],
    ['Next month', text(forecast.nextMonth), ''],
    ['Forecast revenue (INR)', money(forecast.forecast), text(forecast.model)],
    ['Lower range (INR)', money(forecast.lower), 'Rule-based ±10% band'],
    ['Upper range (INR)', money(forecast.upper), 'Rule-based ±10% band'],
    ['Daily average (INR)', money(forecast.dailyAverage), `${text(forecast.basisDays)} selected days`],
    ['Next month days', money(forecast.nextMonthDays), 'Calendar days'],
    ['Disclaimer', text(forecast.disclaimer), 'Forecast, not a fact'],
    [],
    ['Growing demand', 'Revenue (INR)', 'Prior revenue (INR)', 'Growth (%)', 'Category'],
    ...(data?.recommendations?.growingDemand || []).map((row) => [
      text(row.label), money(row.revenue), money(row.previousRevenue), pct(row.growth), text(row.category),
    ]),
    [],
    ['Recommendation type', 'Title', 'Detail', 'Basis'],
    ...(data?.recommendations?.recommendations || []).map((row) => [
      text(row.type), text(row.title), text(row.body), text(row.basis),
    ]),
    [],
    ['Note', text(data?.recommendations?.note), ''],
  ];
  addSheet(book, 'Forecast', forecastRows, [24, 42, 62, 20, 24]);

  /* --------------------------------------------------------------- insights */
  const insights = [
    ['Rule-based insights', 'No AI provider is configured. These are deterministic rules over the filtered records.', '', ''],
    [],
    ['Title', 'Summary', 'Evidence', 'Method'],
    ...(data?.insights?.insights || []).map((row) => [
      text(row.title), text(row.summary), (row.evidence || []).join(' | '), text(row.method),
    ]),
  ];
  addSheet(book, 'Insights', insights, [40, 70, 80, 70]);

  /* -------------------------------------------------------------- inventory */
  const inventory = data?.inventory || {};
  const inventoryRows = [
    ['Inventory cover'],
    ['Available', inventory.available ? 'Yes' : 'No', text(inventory.reason)],
    ['Assumption', text(inventory.assumption), ''],
    ['Stock by UOM', 'On hand', 'Sold in lookback (same UOM)'],
    ...(inventory.stockByUom || []).map((row) => [
      text(row.uom), money(row.stock), money(row.sold28),
    ]),
    ['Alert count', money(inventory.alertCount), `${text(inventory.lookbackDays)}-day lookback`],
    [],
    ['Item code', 'Name', 'UOM', 'Stock', 'Sold in 28 days', 'Daily velocity', 'Days cover', 'Severity', 'Basis'],
    ...(inventory.alerts || []).map((row) => [
      text(row.code), text(row.name), text(row.uom), money(row.stock), money(row.sold28),
      money(row.dailyVelocity), money(row.daysCover), text(row.severity), text(row.basis),
    ]),
  ];
  addSheet(book, 'Inventory', inventoryRows, [22, 40, 10, 12, 16, 16, 12, 12, 62]);

  /* ------------------------------------------------------------ data quality */
  const quality = [
    ['Level', 'Title', 'Detail'],
    ...(data?.dataQuality || []).map((row) => [text(row.level), text(row.title), text(row.detail)]),
  ];
  addSheet(book, 'Data Quality', quality, [12, 62, 100]);

  /* ------------------------------------------------------------- definitions */
  const definitions = [
    ['Metric / rule', 'Definition'],
    ...Object.entries(meta.definitions || {}).map(([key, value]) => [key, text(value)]),
    [],
    ['Caps', 'Value'],
    ...Object.entries(meta.caps || {}).map(([key, value]) => [key, value]),
  ];
  addSheet(book, 'Definitions', definitions, [34, 130]);

  return book;
}

export function dashboardWorkbookBuffer(data) {
  const book = buildDashboardWorkbook(data);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

export function dashboardFilename(data) {
  const meta = data?.meta || {};
  const safe = (value) => String(value || '').replace(/[^0-9A-Za-z-]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = ['sales-dashboard', safe(meta.startDate) || 'period', safe(meta.endDate) || ''].filter(Boolean);
  return `${parts.join('_')}.xlsx`;
}
