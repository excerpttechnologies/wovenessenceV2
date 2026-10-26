import * as XLSX from 'xlsx';

/* ==========================================================================
   Workbook for "Download report" on the Website Analytics screen.

   Built from the exact payload the screen renders, so the file and the page
   cannot disagree. There is no second query here.
   ========================================================================== */

const SHEET_LIMIT = 31;
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : '');
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : '');
const text = (value) => (value === null || value === undefined ? '' : String(value));

function stamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function addSheet(book, name, rows, widths = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (widths.length) sheet['!cols'] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(book, sheet, String(name).slice(0, SHEET_LIMIT));
}

function availability(flag) {
  return flag ? 'Measured' : 'Not available — source not instrumented';
}

export function websiteAnalyticsFilename(data) {
  const meta = data?.meta || {};
  const range = `${meta.startDate || 'from'}_${meta.endDate || 'to'}`;
  return `Woven-Essence-Website-Analytics-${range}.xlsx`;
}

export function websiteAnalyticsWorkbook(data) {
  const book = XLSX.utils.book_new();
  const meta = data?.meta || {};
  const coverage = meta.coverage || {};
  const totals = data?.trend?.totals || {};

  /* ------------------------------------------------------------- summary */
  const summary = [
    ['Woven Essence — Website Analytics'],
    ['Website', text(meta.websiteUrl)],
    ['Generated (IST)', stamp(meta.generatedAt)],
    ['Period', `${text(meta.startDate)} to ${text(meta.endDate)} (${text(meta.days)} days)`],
    ['Comparison', meta.comparison ? `${meta.comparison.startDate} to ${meta.comparison.endDate}` : 'None'],
    ['Company', text(meta.companyLabel)],
    ['Branch scope', text(meta.branchLabel)],
    ['Timezone / currency', `${text(meta.timezone)} / ${text(meta.currency)}`],
    ['Tracker installed', meta.tracking?.installed ? 'Yes' : 'No — visitor-level metrics unavailable'],
    ['Last tracker event', stamp(meta.tracking?.lastEventAt)],
    [],
    ['Data source coverage', 'Status'],
    ['Storefront page counters (visits)', availability(coverage.visits)],
    ['Website orders', availability(coverage.orders)],
    ['Storefront accounts (customers)', availability(coverage.accounts)],
    ['Carts', availability(coverage.carts)],
    ['First-party tracker (websiteevents)', availability(coverage.events)],
    ['Order-address geography', availability(coverage.geography)],
    [],
    ['KPI', 'Current', 'Comparison', 'Change', 'Change type', 'Note'],
  ];
  (data?.kpis?.cards || []).forEach((card) => {
    summary.push([
      text(card.label),
      card.value === null || card.value === undefined ? 'N/A' : num(card.value),
      card.previousValue === null || card.previousValue === undefined ? 'N/A' : num(card.previousValue),
      card.change === null || card.change === undefined ? 'N/A' : num(card.change),
      text(card.changeType),
      text(card.note),
    ]);
  });
  summary.push(
    [],
    ['Definition limits', ''],
    ['Sessions', 'Counted by the storefront visits collection; 30-minute inactivity window.'],
    ['Unique visitors', 'Only from the first-party tracker; one person on two devices counts twice.'],
    ['Logged-in accounts', 'Accounts whose latest login falls in the period — a floor, not an event count.'],
    ['Orders', 'Confirmed through delivered. Cancelled and pending-payment excluded.'],
    ['Geography', 'Order shipping address (delivery location), not visitor IP location.'],
    ['Cart abandonment', 'Cart with at least one line, untouched for 24 hours.'],
  );
  addSheet(book, 'Summary', summary, [34, 22, 22, 14, 14, 80]);

  /* -------------------------------------------------------------- traffic */
  const traffic = [
    ['Date', 'Page views', 'Sessions', 'Unique visitors (tracker)', 'Orders', 'Revenue'],
    ...((data?.trend?.days || []).map((day) => [
      day.date,
      num(day.pageViews),
      num(day.sessions),
      day.visitors === null ? 'Not tracked' : num(day.visitors),
      num(day.orders),
      money(day.revenue),
    ])),
    [],
    ['Total', num(totals.pageViews), num(totals.sessions), totals.visitors === null ? 'Not tracked' : num(totals.visitors), num(totals.orders), money(totals.revenue)],
  ];
  addSheet(book, 'Traffic', traffic, [14, 12, 12, 24, 10, 14]);

  /* -------------------------------------------------------------- funnel */
  const funnel = data?.funnel || { mode: '', stages: [] };
  addSheet(book, 'Funnel', [
    ['Funnel mode', funnel.mode === 'visitors' ? 'Unique visitors (tracker)' : 'Page views and sessions (storefront counter)'],
    ['Stage', 'Count', 'Unit', 'Conversion from previous stage (%)', 'Drop-off', 'Definition'],
    ...(funnel.stages || []).map((stage) => [
      text(stage.label),
      num(stage.count),
      text(stage.unit),
      stage.conversion === null ? 'N/A' : num(stage.conversion),
      stage.dropOff === null ? 'N/A' : num(stage.dropOff),
      funnel.mode === 'visitors'
        ? 'Distinct tracked visitors reaching this event; guest checkout means a stage can be skipped.'
        : 'Page-type view counter, except the first (sessions) and last (orders) stages.',
    ]),
  ], [30, 12, 18, 30, 12, 90]);

  /* ----------------------------------------------------------- geography */
  const geo = data?.geography || {};
  addSheet(book, 'Geography', [
    ['Delivery location from qualifying order addresses'],
    ['Note', text(geo.note)],
    [],
    ['City', 'State', 'Orders', 'Customers', 'Revenue', 'Average order value', 'Share of revenue (%)'],
    ...((geo.cities || []).map((row) => [
      text(row.city), text(row.state), num(row.orders), num(row.customers),
      money(row.revenue), money(row.aov), num(row.revenueShare),
    ])),
    [],
    ['State', 'Orders', 'Customers', 'Revenue', 'Average order value'],
    ...((geo.states || []).map((row) => [
      text(row.state), num(row.orders), num(row.customers), money(row.revenue), money(row.aov),
    ])),
    [],
    ['Orders with no address city', num(geo.unmappedOrders)],
  ], [26, 22, 10, 12, 14, 20, 22]);

  /* ------------------------------------------------------------ products */
  const products = data?.products || {};
  addSheet(book, 'Products', [
    ['Ranked by order-line revenue. Product views and add-to-cart need the tracker.'],
    ['Product', 'Item code', 'Units ordered', 'Orders containing it', 'Revenue'],
    ...((products.byOrders || []).map((row) => [
      text(row.name), text(row.itemCode), num(row.quantity), num(row.orders), money(row.revenue),
    ])),
  ], [44, 26, 16, 22, 14]);

  /* ------------------------------------------------- accounts and carts */
  const accounts = data?.accounts || {};
  const carts = data?.carts || {};
  addSheet(book, 'Accounts & carts', [
    ['Metric', 'Value', 'Definition'],
    ['Registrations', accounts.registrations === null ? 'N/A' : num(accounts.registrations), 'Storefront accounts created inside the period'],
    ['Logged-in accounts', accounts.loggedIn === null ? 'N/A' : num(accounts.loggedIn), 'Accounts whose latest login falls inside the period'],
    ['Total storefront accounts', accounts.total === null ? 'N/A' : num(accounts.total), 'All non-deleted accounts'],
    ['Buying customers', num(accounts.buyers), 'Distinct customers on qualifying orders'],
    ['Repeat buyers', num(accounts.repeatBuyers), 'More than one order in their history'],
    ['Repeat purchase rate (%)', accounts.repeatRate === null ? 'N/A' : num(accounts.repeatRate), 'Repeat buyers / buying customers'],
    ['Revenue from repeat buyers', money(accounts.repeatRevenue), 'Sum of their orders in this period'],
    [],
    ['Carts created', carts.created === null ? 'N/A' : num(carts.created), 'Created inside the period'],
    ['Carts holding items', carts.withItems === null ? 'N/A' : num(carts.withItems), 'At least one line'],
    ['Abandoned carts', carts.abandoned === null ? 'N/A' : num(carts.abandoned), 'Untouched for 24 hours or more'],
    ['Still in progress', carts.stillActive === null ? 'N/A' : num(carts.stillActive), 'Inside the inactivity window'],
    ['Cart abandonment rate (%)', carts.abandonmentRate === null ? 'N/A' : num(carts.abandonmentRate), 'Abandoned / carts holding items'],
  ], [30, 16, 90]);

  /* ------------------------------------------------- sources and devices */
  const visitors = data?.visitors || {};
  addSheet(book, 'Sources & devices', [
    ['Tracker installed', visitors.available ? 'Yes' : 'No — no visitor-level data'],
    ['Source', 'Visitors', 'Sessions', 'Verified purchases', 'Revenue', 'Conversion (%)'],
    ...((visitors.sources || []).map((row) => [
      text(row.label), num(row.visitors), num(row.sessions), num(row.purchases), money(row.revenue), num(row.conversion),
    ])),
    [],
    ['Device', 'Visitors', 'Sessions', 'Verified purchases', 'Revenue', 'Conversion (%)'],
    ...((visitors.devices || []).map((row) => [
      text(row.label), num(row.visitors), num(row.sessions), num(row.purchases), money(row.revenue), num(row.conversion),
    ])),
  ], [24, 12, 12, 20, 14, 18]);

  /* ------------------------------------------------- insights and notes */
  addSheet(book, 'Insights & notes', [
    ['Measured facts, rule-based observations and data-source limitations'],
    [],
    ['Insight', 'Basis'],
    ...((data?.insights || []).map((insight) => [text(insight.title), text(insight.basis)])),
    [],
    ['Data source', 'Status', 'Description'],
    ...((data?.notes || []).map((note) => [
      text(note.title), note.available ? 'Available' : 'Unavailable', text(note.body),
    ])),
  ], [44, 40, 100]);

  return book;
}

export function websiteAnalyticsBuffer(data) {
  return XLSX.write(websiteAnalyticsWorkbook(data), { type: 'buffer', bookType: 'xlsx' });
}
