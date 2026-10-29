/* The assistant's tool registry.

   Each entry is a READ-ONLY business function with a declared input schema.
   The AI model may choose WHICH tool to run and WHICH filters to pass, but it
   never supplies a query: every tool calls lib/ai-assistant/data.js, which
   derives its Mongo filter from the signed-in session's authorised companies
   and locations. A tool name the model invents is rejected, and arguments are
   validated against the schema below before anything runs.

   Every tool returns the same shape, so the interface can render any answer:

     { tool, questionType, title, period, filters,
       kpis[], tables[], charts[], facts, limitations[], sources[], links[] }

   `facts` carries the exact figures in a compact form for the natural-language
   layer. It is NOT what the interface prints - the KPIs, tables and charts are
   built here, from the same numbers, so prose and visuals cannot disagree.
   ========================================================================== */

import {
  DataError,
  customerReport,
  ecommerceReport,
  inventoryReport,
  outstandingReport,
  productPerformance,
  purchaseReport,
  salesAnalytics,
  websiteReport,
  INVENTORY_LOOKBACK_DAYS,
  LOW_STOCK_UNITS,
  COVER_DAYS,
} from './data';
import { describePeriod, periodFromArgs } from './periods';
import { resolveFilters } from './scope';
import { formatDate } from '@/lib/dashboard/date';
import { formatINR, formatNumber, formatPercent } from '@/lib/dashboard/format';

const money = (value) => formatINR(value);
const count = (value) => formatNumber(value);
const pct = (value) => (value === null || value === undefined ? 'N/A' : formatPercent(value, { signed: true }));
const plainPct = (value) => (value === null || value === undefined ? 'N/A' : formatPercent(value));

function kpi(key, label, display, { change = null, changeLabel, note = '', tone = '' } = {}) {
  return {
    key, label, display,
    change,
    changeLabel: changeLabel !== undefined ? changeLabel : (change === null ? '' : pct(change)),
    tone: tone || (change === null ? '' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'),
    note,
  };
}

function table(title, columns, rows, note = '') {
  return { title, columns, rows, note };
}

function bar(title, rows, valueFormat = 'money') {
  return {
    type: 'bar',
    title,
    valueFormat,
    data: rows.map((row) => ({ label: String(row.label || ''), value: Number(row.value) || 0 })),
  };
}

function donut(title, rows, valueFormat = 'money') {
  return {
    type: 'donut',
    title,
    valueFormat,
    data: rows
      .filter((row) => row.available !== false)
      .map((row) => ({ label: String(row.label || ''), value: Number(row.value) || 0 })),
  };
}

function line(title, labels, series, valueFormat = 'money') {
  return { type: 'line', title, labels, series, valueFormat };
}

function resolvePeriodArg(ctx, args = {}) {
  if (args && (args.period || args.startDate || args.endDate)) {
    return periodFromArgs(args, { today: ctx.today });
  }
  return ctx.period;
}

function resolveFilterArg(ctx, args = {}) {
  if (!args || (!args.channel && !args.company && !args.branch)) return ctx.filters;
  return resolveFilters(ctx.scope, {
    company: args.company || ctx.filters.companyId,
    branch: args.branch || ctx.filters.branchId,
    channel: args.channel || ctx.filters.channel,
  }, '');
}

function meta(period, filters) {
  return {
    period: describePeriod(period),
    filters: {
      company: filters.companyLabel,
      branch: filters.branchLabel,
      channel: filters.channelLabel,
    },
  };
}

/* ------------------------------------------------------------ definitions -- */

const PERIOD_PARAMS = {
  period: {
    type: 'string',
    description: 'Reporting period preset: today, yesterday, this_week, last_week, last_7, last_30, last_90, this_month, last_month, this_year, last_year, this_quarter, fy. Omit to use the period the conversation is already discussing.',
    enum: ['today', 'yesterday', 'this_week', 'last_week', 'last_7', 'last_30', 'last_90', 'this_month', 'last_month', 'this_year', 'last_year', 'this_quarter', 'fy'],
  },
  startDate: { type: 'string', description: 'Optional inclusive start date, YYYY-MM-DD. Must be sent with endDate.' },
  endDate: { type: 'string', description: 'Optional inclusive end date, YYYY-MM-DD. Must be sent with startDate.' },
  channel: {
    type: 'string',
    description: 'Sales channel: all, offline, instagram or website.',
    enum: ['all', 'offline', 'instagram', 'website'],
  },
  company: { type: 'string', description: 'Optional authorised company name or id. Omit for all companies in scope.' },
  branch: { type: 'string', description: 'Optional authorised branch name or id. Omit for all branches in scope.' },
};

export const TOOLS = [
  {
    name: 'getSalesSummary',
    questionType: 'sales_summary',
    description: 'Net sales, gross sales, returns, order count, average order value and the change against the comparison period, from ERP POS and sales invoices plus eligible storefront orders. Use for "how much did we sell", "what is our revenue", "how are sales going".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getSalesByBranch',
    questionType: 'sales_by_branch',
    description: 'Sales and net revenue for every branch in the user\'s scope, with each branch\'s share and change against the comparison period. Use for branch comparisons and "which branch is performing best".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getSalesByChannel',
    questionType: 'sales_by_channel',
    description: 'Revenue split across offline store, Instagram and the e-commerce website, and which channel contributes most. Use for channel performance or "compare website sales with offline sales".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getTopSellingProducts',
    questionType: 'top_products',
    description: 'Best-selling products by line revenue and units sold in the period, from ERP sale lines and storefront order lines. Use for "which products are selling the most", "top five sarees".',
    parameters: {
      ...PERIOD_PARAMS,
      limit: { type: 'number', description: 'How many products to return, 1-20. Default 8.' },
      category: { type: 'string', description: 'Optional product group or item-name filter, e.g. sarees, fabrics.' },
    },
  },
  {
    name: 'getInventorySummary',
    questionType: 'inventory_summary',
    description: 'Current stock on hand: item count, total units, valuation at purchase cost, low-stock and out-of-stock counts. Use for "how much stock do we have", "inventory value".',
    parameters: { category: { type: 'string', description: 'Optional product group or item-name filter.' } },
  },
  {
    name: 'getLowStockProducts',
    questionType: 'low_stock',
    description: 'Products running low or out of stock, with 28-day sales velocity and days of cover, plus suggested reorder quantities. Use for "what is running low", "what should we reorder", "which sarees are out of stock".',
    parameters: {
      category: { type: 'string', description: 'Optional product group or item-name filter, e.g. sarees.' },
      limit: { type: 'number', description: 'How many rows to return, 1-25. Default 10.' },
    },
  },
  {
    name: 'getProductPerformance',
    questionType: 'product_performance',
    description: 'Product-level revenue, units sold and current stock, including products with high stock but no sales in the period. Use for "high stock but low sales", "slow moving products", "product performance".',
    parameters: {
      ...PERIOD_PARAMS,
      highStockOnly: { type: 'boolean', description: 'When true, also list high-value products with no sales in the period.' },
    },
  },
  {
    name: 'getPurchaseSummary',
    questionType: 'purchase_summary',
    description: 'Purchase value and document counts for the period, top suppliers, and GRCs received but not yet converted to a purchase invoice. Use for "purchases", "supplier purchases", "pending purchases".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getOutstandingBalances',
    questionType: 'outstanding_balances',
    description: 'Current payables to suppliers and receivables from customers, with the documents behind them and the parties owing the most. Use for "outstanding", "dues", "pending payments", "what do we owe".',
    parameters: {},
  },
  {
    name: 'getCustomerAnalytics',
    questionType: 'customer_analytics',
    description: 'Buyer count, new versus returning buyers, repeat rate, average spend and top customers for the period. Use for "how many customers", "repeat customers", "customer retention".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getEcommerceOrderSummary',
    questionType: 'ecommerce_orders',
    description: 'Storefront orders by status, website revenue, average order value, pending-payment and cancelled counts, top online products and recent orders. Use for "how many online orders", "pending website orders".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'getWebsiteAnalytics',
    questionType: 'website_analytics',
    description: 'Website sessions, page views, unique visitors when the tracker is installed, order conversion, registrations and the storefront funnel. Use for "website visitors", "traffic", "conversion", "how many visitors became customers".',
    parameters: PERIOD_PARAMS,
  },
  {
    name: 'generateBusinessReport',
    questionType: 'business_report',
    description: 'A cross-functional business report for the period: sales, top products, inventory position, purchases and outstanding balances in one answer. Use for "give me a business report", "overall summary", "how is the business doing".',
    parameters: PERIOD_PARAMS,
  },
];

export const TOOL_NAMES = TOOLS.map((tool) => tool.name);

export function toolDefinitions() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: tool.parameters || {},
    },
  }));
}

export function findTool(name) {
  return TOOLS.find((tool) => tool.name === name) || null;
}

/* Validate one argument object against the declared schema. Only primitive
   types are used, so this is deliberately small - but it does reject unknown
   keys, wrong types and out-of-range numbers instead of passing them on. */
export function validateArgs(tool, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new DataError(422, 'Tool arguments must be an object.', 'INVALID_TOOL_ARGS');
  }
  const schema = tool.parameters || {};
  const out = {};

  Object.entries(args).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    const spec = schema[key];
    if (!spec) throw new DataError(422, `Unknown argument "${key}" for ${tool.name}.`, 'INVALID_TOOL_ARGS');
    if (spec.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new DataError(422, `${key} must be a number.`, 'INVALID_TOOL_ARGS');
      out[key] = Math.max(1, Math.min(25, Math.trunc(n)));
      return;
    }
    if (spec.type === 'boolean') {
      out[key] = value === true || value === 'true';
      return;
    }
    const text = String(value).trim();
    if (spec.enum && !spec.enum.includes(text)) {
      throw new DataError(422, `${key} must be one of: ${spec.enum.join(', ')}.`, 'INVALID_TOOL_ARGS');
    }
    if (text.length > 200) throw new DataError(422, `${key} is too long.`, 'INVALID_TOOL_ARGS');
    out[key] = text;
  });

  return out;
}

/* -------------------------------------------------------------- execution -- */

const SALES_SOURCES = ['ERP POS invoices', 'ERP sales invoices', 'ERP returns'];
const WEBSITE_SOURCES = ['Storefront orders'];

async function runSalesSummary(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await salesAnalytics(ctx.scope, filters, period);
  const current = data.current;
  const topBranch = [...data.branches].filter((b) => b.businessId).sort((a, b) => b.net - a.net)[0] || null;
  const topChannel = [...data.channels.rows].sort((a, b) => b.net - a.net)[0] || null;

  const kpis = [
    kpi('net', 'Net revenue', money(current.net), {
      change: data.changes.net,
      note: 'Gross sales less returns, including eligible storefront orders.',
    }),
    kpi('gross', 'Gross sales', money(current.grossSales + current.websiteRevenue), {
      change: data.changes.gross,
      note: 'Before returns.',
    }),
    kpi('orders', 'Orders', count(current.orders), {
      change: data.changes.orders,
      changeLabel: data.changes.orders === null ? '' : pct(data.changes.orders),
      note: 'Bills plus eligible storefront orders; a return document is not an order.',
    }),
    kpi('aov', 'Average order value', current.aov === null ? 'N/A' : money(current.aov), {
      change: data.changes.aov,
      note: 'Net revenue divided by orders.',
    }),
    kpi('returns', 'Returns', money(current.returns), {
      change: data.changes.returns,
      tone: 'neutral',
      note: 'POS returns and sales returns in the period.',
    }),
    kpi('units', 'Units sold', count(current.units), { note: 'Quantity on ERP sale lines.' }),
  ];

  const charts = [
    line('Daily sales and returns', data.daily.labels, [
      { name: 'Sales', points: data.daily.sales },
      { name: 'Returns', points: data.daily.returns },
    ], 'money'),
    bar('Revenue by branch', data.branches.map((b) => ({ label: b.branchName, value: b.net })), 'money'),
  ];

  const tables = [
    table('Sales by branch', [
      { key: 'branchName', label: 'Branch', format: 'text' },
      { key: 'net', label: 'Net revenue', format: 'money', align: 'right' },
      { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
      { key: 'change', label: 'Change', format: 'percent', align: 'right' },
    ], data.branches.map((b) => ({
      branchName: b.branchName,
      net: b.net,
      orders: b.orders,
      change: b.change,
    })), period.comparison ? `Compared with ${period.comparison.label}.` : ''),
  ];

  return {
    tool: 'getSalesSummary',
    questionType: 'sales_summary',
    title: `Sales summary · ${period.label}`,
    ...meta(period, filters),
    kpis,
    tables,
    charts,
    facts: {
      period: period.label,
      comparison: period.comparison?.label || null,
      net: current.net,
      gross: current.grossSales + current.websiteRevenue,
      returns: current.returns,
      orders: current.orders,
      aov: current.aov,
      units: current.units,
      change: data.changes.net,
      previousNet: data.previous.net,
      topBranch: topBranch ? { name: topBranch.branchName, net: topBranch.net } : null,
      topChannel: topChannel ? { label: topChannel.label, net: topChannel.net } : null,
      branches: data.branches.map((branch) => ({
        branchName: branch.branchName,
        net: branch.net,
        orders: branch.orders,
        share: branch.share,
        change: branch.change,
      })),
      channels: data.channels.rows.map((row) => ({
        label: row.label, net: row.net, share: row.share, available: row.available,
      })),
      topProduct: data.topProducts[0] ? { name: data.topProducts[0].name, revenue: data.topProducts[0].revenue } : null,
      websiteRevenue: current.websiteRevenue,
      websiteOrders: current.websiteOrders,
      instagramNet: current.instagramNet,
      offlineNet: current.offlineNet,
      counts: data.counts,
      paymentMix: data.paymentMix,
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, ...(data.website.available ? WEBSITE_SOURCES : [])],
    links: [
      { label: 'Sales Report', href: '/admin/reports/sales-report' },
      { label: 'Sales Analysis', href: '/admin/reports/sales-analysis' },
    ],
    followUps: [
      'Break that down by branch',
      'Which products are selling the most?',
      'Compare this month with last month',
      'Which sales channel generates the most revenue?',
    ],
  };
}

async function runSalesByBranch(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await salesAnalytics(ctx.scope, filters, period);
  const rows = data.branches.filter((row) => row.businessId);
  const unassigned = data.branches.find((row) => !row.businessId) || null;
  const best = rows[0] || null;
  const totalNet = rows.reduce((sum, row) => sum + row.net, 0);

  const kpis = [
    kpi('best', 'Best branch', best ? best.branchName : 'No branch sales', {
      note: best ? `${money(best.net)} net revenue` : 'No sale in scope for this period.',
    }),
    kpi('branches', 'Branches with sales', count(rows.filter((row) => row.orders > 0).length)),
    kpi('total', 'Combined net revenue', money(totalNet + (unassigned?.net || 0))),
    kpi('topShare', 'Top branch share', best ? plainPct(best.share) : 'N/A'),
  ];

  return {
    tool: 'getSalesByBranch',
    questionType: 'sales_by_branch',
    title: `Branch performance · ${period.label}`,
    ...meta(period, filters),
    kpis,
    tables: [
      table('Sales by branch', [
        { key: 'branchName', label: 'Branch', format: 'text' },
        { key: 'net', label: 'Net revenue', format: 'money', align: 'right' },
        { key: 'share', label: 'Share', format: 'percent', align: 'right' },
        { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
        { key: 'previousNet', label: 'Previous', format: 'money', align: 'right' },
        { key: 'change', label: 'Change', format: 'percent', align: 'right' },
      ], data.branches.map((b) => ({
        branchName: b.branchName,
        net: b.net,
        share: b.share,
        orders: b.orders,
        previousNet: b.previousNet,
        change: b.change,
      })), period.comparison ? `Compared with ${period.comparison.label}. Branches are the ERP companies that sales are booked under.` : 'Branches are the ERP companies that sales are booked under.'),
    ],
    charts: [
      bar('Net revenue by branch', data.branches.map((b) => ({ label: b.branchName, value: b.net })), 'money'),
      donut('Revenue share by branch', data.branches.map((b) => ({ label: b.branchName, value: b.net })), 'money'),
    ],
    facts: {
      period: period.label,
      comparison: period.comparison?.label || null,
      branches: data.branches.map((b) => ({
        branchName: b.branchName, net: b.net, orders: b.orders, share: b.share,
        previousNet: b.previousNet, change: b.change,
      })),
      best: best ? { branchName: best.branchName, net: best.net, share: best.share } : null,
      totalNet: totalNet + (unassigned?.net || 0),
      unassigned: unassigned ? { net: unassigned.net, orders: unassigned.orders } : null,
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, ...(data.website.available ? WEBSITE_SOURCES : [])],
    links: [{ label: 'Sales Analysis', href: '/admin/reports/sales-analysis' }],
    followUps: ['Which sales channel generates the most revenue?', 'Which products are selling the most?', 'Show sales for last month'],
  };
}

async function runSalesByChannel(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await salesAnalytics(ctx.scope, filters, period);
  const rows = data.channels.rows;
  const best = [...rows].filter((r) => r.available).sort((a, b) => b.net - a.net)[0] || null;

  return {
    tool: 'getSalesByChannel',
    questionType: 'sales_by_channel',
    title: `Channel performance · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('top', 'Top channel', best ? best.label : 'None', {
        note: best ? `${money(best.net)} · ${plainPct(best.share)} of revenue` : '',
      }),
      kpi('total', 'Total revenue across channels', money(data.channels.total)),
      kpi('website', 'Website revenue', data.website.available ? money(rows.find((r) => r.key === 'website')?.net || 0) : 'Not available', {
        note: data.website.available ? `${data.current.websiteOrders} eligible storefront orders` : data.website.reason,
      }),
      kpi('instagram', 'Instagram revenue', money(rows.find((r) => r.key === 'instagram')?.net || 0), {
        note: 'Only bills tagged Instagram at billing.',
      }),
    ],
    tables: [
      table('Revenue by channel', [
        { key: 'label', label: 'Channel', format: 'text' },
        { key: 'net', label: 'Net revenue', format: 'money', align: 'right' },
        { key: 'share', label: 'Share', format: 'percent', align: 'right' },
        { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
        { key: 'change', label: 'Change', format: 'percent', align: 'right' },
      ], rows.map((row) => ({
        label: row.label,
        net: row.available ? row.net : null,
        share: row.share,
        orders: row.orders,
        change: row.available ? row.change : null,
      })), 'Website revenue excludes storefront orders whose invoice number already exists in ERP.'),
    ],
    charts: [donut('Revenue share by channel', rows, 'money')],
    facts: {
      period: period.label,
      rows: rows.map((row) => ({
        label: row.label, net: row.net, orders: row.orders, share: row.share,
        available: row.available, change: row.change, note: row.note,
      })),
      total: data.channels.total,
      best: best ? { label: best.label, net: best.net, share: best.share } : null,
      websiteDuplicates: data.website.duplicateCount,
      websiteDuplicateRevenue: data.website.duplicateRevenue,
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, ...(data.website.available ? WEBSITE_SOURCES : [])],
    links: [
      { label: 'Sales Analysis', href: '/admin/reports/sales-analysis' },
      { label: 'Website Analytics', href: '/admin/ecommerce/website-analytics' },
    ],
    followUps: ['Compare website sales with offline sales', 'How many e-commerce orders were placed today?', 'Which products are selling the most?'],
  };
}

function productFilter(rows, hint) {
  if (!hint) return rows;
  const needle = String(hint).toLowerCase().replace(/s$/, '');
  return rows.filter((row) => String(row.name || '').toLowerCase().includes(needle)
    || String(row.code || '').toLowerCase().includes(needle));
}

async function runTopProducts(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const limit = Math.min(20, Math.max(1, Number(args.limit) || 8));
  const data = await salesAnalytics(ctx.scope, filters, period);
  const rows = productFilter(data.topProducts, args.category).slice(0, limit);
  const totalRevenue = data.topProducts.reduce((sum, row) => sum + row.revenue, 0);

  return {
    tool: 'getTopSellingProducts',
    questionType: 'top_products',
    title: `Top products · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('count', 'Products ranked', count(rows.length)),
      kpi('top', 'Top product', rows[0] ? rows[0].name : 'No sales', {
        note: rows[0] ? `${money(rows[0].revenue)} from ${count(rows[0].qty)} units` : '',
      }),
      kpi('revenue', 'Revenue in top products', money(rows.reduce((sum, row) => sum + row.revenue, 0)), {
        note: 'Line value before returns.',
      }),
    ],
    tables: [
      table('Best-selling products', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'code', label: 'Code', format: 'text' },
        { key: 'qty', label: 'Units', format: 'number', align: 'right' },
        { key: 'revenue', label: 'Revenue', format: 'money', align: 'right' },
        { key: 'share', label: 'Share', format: 'percent', align: 'right' },
      ], rows.map((row) => ({
        name: row.name,
        code: row.code || '',
        qty: row.qty,
        revenue: row.revenue,
        share: shareOf(row.revenue, totalRevenue),
      })), args.category ? `Filtered to products matching "${args.category}".` : 'Line revenue before returns.'),
    ],
    charts: [bar('Revenue by product', rows.slice(0, 8).map((row) => ({ label: row.name, value: row.revenue })), 'money')],
    facts: {
      period: period.label,
      rows: rows.map((row) => ({ name: row.name, code: row.code, qty: row.qty, revenue: row.revenue })),
      top: rows[0] ? { name: rows[0].name, revenue: rows[0].revenue, qty: rows[0].qty } : null,
      totalTopRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      category: args.category || null,
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, ...(data.website.available ? WEBSITE_SOURCES : [])],
    links: [{ label: 'Sales Analysis', href: '/admin/reports/sales-analysis' }],
    followUps: ['Which products have high stock but low sales?', 'Which sarees are running low on stock?', 'Compare this month with last month'],
  };
}

/* Percentages are rounded once, in one place, so a table and a sentence
   cannot print 12.3% and 12.4% for the same figure. */
function shareOf(value, total) {
  const whole = Number(total) || 0;
  return whole ? Math.round((Number(value) / whole) * 1000) / 10 : null;
}

async function runInventorySummary(ctx, args) {
  const inventory = await inventoryReport(ctx.scope, ctx.filters, {
    categoryHint: args.category || '',
    limit: 8,
  });

  return {
    tool: 'getInventorySummary',
    questionType: 'inventory_summary',
    title: 'Inventory position',
    period: describePeriod(ctx.period),
    filters: {
      company: ctx.filters.companyLabel,
      branch: ctx.filters.branchLabel,
      channel: 'All channels (inventory is not channel-specific)',
    },
    kpis: [
      kpi('units', 'Units in stock', count(inventory.totalUnits)),
      kpi('value', 'Stock value', money(inventory.totalValue), { note: 'Units × purchase cost (final net, falling back to purchase rate).' }),
      kpi('items', 'Item codes with stock history', count(inventory.itemCount)),
      kpi('low', 'Low stock', count(inventory.lowStock.length), {
        note: `${inventory.lowStockThreshold} units or fewer.`,
        tone: inventory.lowStock.length ? 'down' : 'flat',
      }),
      kpi('out', 'Out of stock', count(inventory.outOfStock.length), { tone: inventory.outOfStock.length ? 'down' : 'flat' }),
    ],
    tables: [
      table('Highest-value products in stock', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'code', label: 'Code', format: 'text' },
        { key: 'category', label: 'Category', format: 'text' },
        { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
        { key: 'value', label: 'Value', format: 'money', align: 'right' },
      ], inventory.topByValue.map((row) => ({
        name: row.name, code: row.code, category: row.category, stock: row.stock, value: row.value,
      })), 'Stock is the IN_STOCK quantity on barcode rows.'),
    ],
    charts: [bar('Stock value by product', inventory.topByValue.slice(0, 8).map((row) => ({ label: row.name, value: row.value })), 'money')],
    facts: {
      itemCount: inventory.itemCount,
      units: inventory.totalUnits,
      value: inventory.totalValue,
      lowStockCount: inventory.lowStock.length,
      outOfStockCount: inventory.outOfStock.length,
      lowStock: inventory.lowStock.slice(0, 5),
      outOfStock: inventory.outOfStock.slice(0, 5),
      category: args.category || null,
      asOf: inventory.generatedFor,
    },
    limitations: inventory.limitations,
    sources: ['ERP barcode stock rows', 'ERP POS sale lines (velocity)'],
    links: [
      { label: 'Item Stock', href: '/admin/reports/item-stock' },
      { label: 'Master Stock Report', href: '/admin/report/master-stock-report' },
    ],
    followUps: ['Which sarees are running low on stock?', 'Which products should we reorder?', 'Which products have high stock but low sales?'],
  };
}

async function runLowStock(ctx, args) {
  const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
  const inventory = await inventoryReport(ctx.scope, ctx.filters, {
    categoryHint: args.category || '',
    limit,
  });

  const rows = [
    ...inventory.lowStock.map((row) => ({ ...row, state: 'Low stock' })),
    ...inventory.outOfStock.map((row) => ({ ...row, state: 'Out of stock' })),
    ...inventory.coverAlerts.map((row) => ({ ...row, state: 'Cover below review line' })),
  ];
  const seen = new Set();
  const unique = rows.filter((row) => {
    const key = `${row.code}|${row.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    tool: 'getLowStockProducts',
    questionType: 'low_stock',
    title: args.category ? `Stock alerts · ${args.category}` : 'Stock alerts',
    period: describePeriod(ctx.period),
    filters: {
      company: ctx.filters.companyLabel,
      branch: ctx.filters.branchLabel,
      channel: 'All channels (inventory is not channel-specific)',
    },
    kpis: [
      kpi('low', 'Low stock', count(inventory.lowStock.length), { note: `${inventory.lowStockThreshold} units or fewer.`, tone: inventory.lowStock.length ? 'down' : 'flat' }),
      kpi('out', 'Out of stock', count(inventory.outOfStock.length), { tone: inventory.outOfStock.length ? 'down' : 'flat' }),
      kpi('cover', 'Below cover line', count(inventory.coverAlerts.length), { note: `${inventory.coverDays}-day review line from 28-day sales velocity.` }),
      kpi('reorder', 'Reorder suggestions', count(inventory.reorder.length)),
    ],
    tables: [
      table('Stock alerts', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'code', label: 'Code', format: 'text' },
        { key: 'category', label: 'Category', format: 'text' },
        { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
        { key: 'sold28', label: 'Sold 28d', format: 'units', align: 'right' },
        { key: 'daysCover', label: 'Days cover', format: 'number', align: 'right' },
        { key: 'state', label: 'State', format: 'text' },
      ], unique.slice(0, limit * 2), 'There is no configured reorder threshold; low stock is 5 units or fewer and the cover line is a 21-day assumption.'),
      table('Suggested reorders', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
        { key: 'dailyVelocity', label: 'Daily sales', format: 'number', align: 'right' },
        { key: 'suggestedQty', label: 'Suggested qty', format: 'units', align: 'right' },
      ], inventory.reorder.map((row) => ({
        name: row.name, stock: row.stock, dailyVelocity: row.dailyVelocity, suggestedQty: row.suggestedQty,
      })), 'Suggestions, not instructions: they target 21 days of cover at the recent sales rate.'),
    ],
    charts: [bar('Stock on hand (alert products)', inventory.lowStock.slice(0, 10).map((row) => ({ label: row.name, value: row.stock })), 'number')],
    facts: {
      category: args.category || null,
      lowStock: inventory.lowStock.map((row) => ({ name: row.name, code: row.code, stock: row.stock, sold28: row.sold28, daysCover: row.daysCover })),
      outOfStock: inventory.outOfStock.map((row) => ({ name: row.name, code: row.code, sold28: row.sold28 })),
      reorder: inventory.reorder.map((row) => ({ name: row.name, stock: row.stock, suggestedQty: row.suggestedQty, dailyVelocity: row.dailyVelocity })),
      threshold: inventory.lowStockThreshold,
      coverDays: inventory.coverDays,
      lookbackDays: inventory.lookbackDays,
      lowStockCount: inventory.lowStock.length,
      outOfStockCount: inventory.outOfStock.length,
    },
    limitations: inventory.limitations,
    sources: ['ERP barcode stock rows', 'ERP POS sale lines'],
    links: [
      { label: 'Item Stock', href: '/admin/reports/item-stock' },
      { label: 'Master Stock Report', href: '/admin/report/master-stock-report' },
    ],
    followUps: ['Which products should we reorder?', 'Show stock value by category', 'Which products have high stock but low sales?'],
  };
}

async function runProductPerformance(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await productPerformance(ctx.scope, filters, period, {
    highStockOnly: args.highStockOnly === true,
  });

  const tables = [
    table('Product performance', [
      { key: 'name', label: 'Product', format: 'text' },
      { key: 'code', label: 'Code', format: 'text' },
      { key: 'revenue', label: 'Revenue', format: 'money', align: 'right' },
      { key: 'qty', label: 'Units sold', format: 'units', align: 'right' },
      { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
      { key: 'daysCover', label: 'Days cover', format: 'number', align: 'right' },
    ], data.rows.map((row) => ({
      name: row.name, code: row.code, revenue: row.revenue, qty: row.qty,
      stock: row.stock, daysCover: row.daysCover,
    })), 'Stock is null when the product has no current stock row.'),
  ];

  if (data.highStockLowSales) {
    tables.push(table('High stock, no sales in the period', [
      { key: 'name', label: 'Product', format: 'text' },
      { key: 'code', label: 'Code', format: 'text' },
      { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
      { key: 'value', label: 'Stock value', format: 'money', align: 'right' },
      { key: 'soldInPeriod', label: 'Units sold', format: 'units', align: 'right' },
    ], data.highStockLowSales.map((row) => ({
      name: row.name, code: row.code, stock: row.stock, value: row.value, soldInPeriod: row.soldInPeriod,
    })), 'At least 21 units in stock and no units sold in the selected period.'));
  }

  return {
    tool: 'getProductPerformance',
    questionType: 'product_performance',
    title: `Product performance · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('products', 'Products sold', count(data.rows.length)),
      kpi('revenue', 'Revenue in top products', money(data.rows.reduce((sum, row) => sum + row.revenue, 0))),
      kpi('highStock', 'High stock, no sales', data.highStockLowSales ? count(data.highStockLowSales.length) : 'Not requested', {
        note: 'At least 21 units in stock with zero units sold.',
      }),
    ],
    tables,
    charts: [bar('Revenue by product', data.rows.slice(0, 8).map((row) => ({ label: row.name, value: row.revenue })), 'money')],
    facts: {
      period: period.label,
      rows: data.rows.slice(0, 10),
      highStockLowSales: data.highStockLowSales || null,
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, 'ERP barcode stock rows'],
    links: [
      { label: 'Sales Analysis', href: '/admin/reports/sales-analysis' },
      { label: 'Item Stock', href: '/admin/reports/item-stock' },
    ],
    followUps: ['Which products should we reorder?', 'Which products are selling the most?', 'Show slow-moving stock'],
  };
}

async function runPurchaseSummary(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await purchaseReport(ctx.scope, filters, period);
  const topSupplier = data.suppliers[0] || null;

  return {
    tool: 'getPurchaseSummary',
    questionType: 'purchase_summary',
    title: `Purchases · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('purchases', 'Purchase value', money(data.total), { note: `Source: ${data.source}.` }),
      kpi('documents', 'Documents', count(data.documents)),
      kpi('pending', 'GRCs not yet invoiced', count(data.pendingInPeriod), {
        note: `${money(data.pendingValue)} received in this period.`,
        tone: data.pendingInPeriod ? 'down' : 'flat',
      }),
      kpi('open', 'All open GRCs', count(data.pendingAll), { note: 'Every GRC in scope with no purchase invoice, regardless of date.' }),
    ],
    tables: [
      table('Purchase by supplier', [
        { key: 'supplier', label: 'Supplier', format: 'text' },
        { key: 'value', label: 'Purchase value', format: 'money', align: 'right' },
        { key: 'share', label: 'Share', format: 'percent', align: 'right' },
        { key: 'documents', label: 'Documents', format: 'number', align: 'right' },
      ], data.suppliers.map((row) => ({
        supplier: row.supplier, value: row.value, share: row.share, documents: row.documents,
      })), period.comparison ? '' : ''),
      table('Purchase documents', [
        { key: 'docNo', label: 'Document', format: 'text' },
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'supplier', label: 'Supplier', format: 'text' },
        { key: 'type', label: 'Type', format: 'text' },
        { key: 'value', label: 'Value', format: 'money', align: 'right' },
      ], data.rows, 'Newest first, up to 20 documents.'),
    ],
    charts: [bar('Purchases by supplier', data.suppliers.slice(0, 8).map((row) => ({ label: row.supplier, value: row.value })), 'money')],
    facts: {
      period: period.label,
      total: data.total,
      source: data.source,
      invoiceCount: data.invoiceCount,
      grcCount: data.grcCount,
      pendingInPeriod: data.pendingInPeriod,
      pendingValue: data.pendingValue,
      pendingAll: data.pendingAll,
      topSupplier: topSupplier ? { supplier: topSupplier.supplier, value: topSupplier.value } : null,
      suppliers: data.suppliers,
    },
    limitations: data.limitations,
    sources: ['ERP purchase invoices', 'ERP goods receipt challans'],
    links: [
      { label: 'Supplier Bill Report', href: '/admin/reports/supplier-bill' },
      { label: 'Supplier Outstanding', href: '/admin/reports/supplier-outstanding' },
    ],
    followUps: ['Show our pending purchases and outstanding payments', 'Which suppliers do we owe the most?', 'How much did we purchase this month?'],
  };
}

async function runOutstanding(ctx) {
  const data = await outstandingReport(ctx.scope, ctx.filters);

  return {
    tool: 'getOutstandingBalances',
    questionType: 'outstanding_balances',
    title: 'Outstanding balances',
    period: describePeriod(ctx.period),
    filters: {
      company: ctx.filters.companyLabel,
      branch: ctx.filters.branchLabel,
      channel: 'All channels (balances are not channel-specific)',
    },
    kpis: [
      kpi('payables', 'Payable to suppliers', money(data.payables), { tone: 'down', note: 'Purchase invoices less debit notes and payment vouchers.' }),
      kpi('receivables', 'Receivable from customers', money(data.receivables), { note: 'Invoices and POS dues less returns, credit notes and receipts.' }),
      kpi('net', 'Net position', money(data.netPosition), {
        note: data.netPosition >= 0 ? 'Receivables exceed payables.' : 'Payables exceed receivables.',
      }),
    ],
    tables: [
      table('Supplier payables', [
        { key: 'name', label: 'Supplier', format: 'text' },
        { key: 'value', label: 'Purchased value', format: 'money', align: 'right' },
        { key: 'documents', label: 'Documents', format: 'number', align: 'right' },
      ], data.suppliers, 'Purchase invoices in scope, before debit notes and payments.'),
      table('Customer dues', [
        { key: 'name', label: 'Customer', format: 'text' },
        { key: 'value', label: 'Unpaid balance', format: 'money', align: 'right' },
        { key: 'bills', label: 'Bills', format: 'number', align: 'right' },
      ], data.customers, 'The unpaid part of POS bills (sellDue), not the whole bill.'),
    ],
    charts: [],
    facts: {
      payables: data.payables,
      receivables: data.receivables,
      net: data.netPosition,
      components: data.components,
      topSupplier: data.suppliers[0] || null,
      topCustomer: data.customers[0] || null,
    },
    limitations: data.limitations,
    sources: ['ERP purchase invoices', 'ERP debit notes', 'ERP vouchers', 'ERP sales invoices', 'ERP POS bills', 'ERP credit notes'],
    links: [
      { label: 'Supplier Outstanding', href: '/admin/reports/supplier-outstanding' },
      { label: 'Customer Outstanding', href: '/admin/reports/customer-outstanding' },
      { label: 'Payment Voucher Report', href: '/admin/reports/payment-voucher-report' },
    ],
    followUps: ['Show our pending purchases', 'Which customers owe us the most?', 'How much did we purchase this month?'],
  };
}

async function runCustomers(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await customerReport(ctx.scope, filters, period);

  return {
    tool: 'getCustomerAnalytics',
    questionType: 'customer_analytics',
    title: `Customers · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('buyers', 'Buyers', count(data.buyers), { note: 'Distinct identified customers, ERP and storefront.' }),
      kpi('new', 'New buyers', count(data.newBuyers), { note: 'First observed purchase falls in this period.' }),
      kpi('returning', 'Returning buyers', count(data.returningBuyers), { note: 'More than one bill and seen before this period.' }),
      kpi('repeatRate', 'Repeat rate', data.repeatRate === null ? 'N/A' : plainPct(data.repeatRate)),
      kpi('spend', 'Average spend per buyer', data.averageSpend === null ? 'N/A' : money(data.averageSpend)),
    ],
    tables: [
      table('Top customers', [
        { key: 'name', label: 'Customer', format: 'text' },
        { key: 'orders', label: 'Bills', format: 'number', align: 'right' },
        { key: 'value', label: 'Value', format: 'money', align: 'right' },
        { key: 'share', label: 'Share', format: 'percent', align: 'right' },
      ], data.topCustomers, 'Walk-in bills with no customer attached are grouped as "Walk-in customer".'),
    ],
    charts: [bar('Top customers by value', data.topCustomers.slice(0, 8).map((row) => ({ label: row.name, value: row.value })), 'money')],
    facts: {
      period: period.label,
      buyers: data.buyers,
      previousBuyers: data.previousBuyers,
      newBuyers: data.newBuyers,
      returningBuyers: data.returningBuyers,
      repeatRate: data.repeatRate,
      averageSpend: data.averageSpend,
      totalValue: data.totalValue,
      top: data.topCustomers[0] || null,
      topCustomers: data.topCustomers.slice(0, 5),
    },
    limitations: data.limitations,
    sources: [...SALES_SOURCES, ...(data.buyers ? ['Storefront orders'] : [])],
    links: [{ label: 'Customer Outstanding', href: '/admin/reports/customer-outstanding' }],
    followUps: ['How many website visitors converted into customers?', 'Which customers owe us the most?', 'Compare this month with last month'],
  };
}

async function runEcommerce(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const data = await ecommerceReport(ctx.scope, filters, period);

  if (!data.available) {
    return {
      tool: 'getEcommerceOrderSummary',
      questionType: 'ecommerce_orders',
      title: 'E-commerce orders unavailable',
      ...meta(period, filters),
      kpis: [],
      tables: [],
      charts: [],
      facts: { available: false, reason: data.reason, period: period.label },
      limitations: data.limitations,
      sources: [],
      links: [{ label: 'Website Analytics', href: '/admin/ecommerce/website-analytics' }],
      followUps: ['How many website visitors converted into customers?', 'What are our total sales today?'],
    };
  }

  return {
    tool: 'getEcommerceOrderSummary',
    questionType: 'ecommerce_orders',
    title: `E-commerce orders · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('orders', 'Orders', count(data.orders), { note: 'Confirmed through delivered; cancelled and pending payment excluded.' }),
      kpi('revenue', 'Website revenue', money(data.revenue)),
      kpi('aov', 'Average order value', data.aov === null ? 'N/A' : money(data.aov)),
      kpi('pending', 'Pending payment', count(data.pendingPayment), { tone: data.pendingPayment ? 'down' : 'flat' }),
      kpi('cancelled', 'Cancelled', count(data.cancelled), { note: money(data.cancelledValue), tone: data.cancelled ? 'down' : 'flat' }),
      kpi('customers', 'Buying customers', count(data.customers)),
    ],
    tables: [
      table('Orders by status', [
        { key: 'status', label: 'Status', format: 'text' },
        { key: 'count', label: 'Orders', format: 'number', align: 'right' },
      ], data.byStatus, 'Every storefront order in the period, including excluded statuses.'),
      table('Top online products', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'code', label: 'Code', format: 'text' },
        { key: 'qty', label: 'Units', format: 'number', align: 'right' },
        { key: 'revenue', label: 'Revenue', format: 'money', align: 'right' },
      ], data.topProducts, 'From order lines on eligible orders.'),
      table('Recent orders', [
        { key: 'orderNumber', label: 'Order', format: 'text' },
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'customer', label: 'Customer', format: 'text' },
        { key: 'city', label: 'City', format: 'text' },
        { key: 'status', label: 'Status', format: 'text' },
        { key: 'value', label: 'Value', format: 'money', align: 'right' },
      ], data.recent),
    ],
    charts: [
      donut('Orders by status', data.byStatus.map((row) => ({ label: row.status, value: row.count })), 'number'),
      bar('Top online products', data.topProducts.slice(0, 8).map((row) => ({ label: row.name, value: row.revenue })), 'money'),
    ],
    facts: {
      period: period.label,
      orders: data.orders,
      revenue: data.revenue,
      aov: data.aov,
      customers: data.customers,
      cancelled: data.cancelled,
      pendingPayment: data.pendingPayment,
      duplicatesExcluded: data.duplicatesExcluded,
      duplicateRevenue: data.duplicateRevenue,
      byStatus: data.byStatus,
      topProduct: data.topProducts[0] || null,
      registrations: data.registrations,
    },
    limitations: data.limitations,
    sources: ['Storefront orders'],
    links: [
      { label: 'Website Analytics', href: '/admin/ecommerce/website-analytics' },
      { label: 'E-commerce Products', href: '/admin/ecommerce/product' },
    ],
    followUps: ['How many website visitors converted into customers?', 'Compare website sales with offline sales', 'Which products are selling the most?'],
  };
}

async function runWebsite(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);
  const report = await websiteReport(ctx.scope, filters, period);

  if (!report.available) {
    return {
      tool: 'getWebsiteAnalytics',
      questionType: 'website_analytics',
      title: 'Website analytics unavailable',
      ...meta(period, filters),
      kpis: [],
      tables: [],
      charts: [],
      facts: { available: false, reason: report.reason, period: period.label },
      limitations: report.limitations,
      sources: [],
      links: [{ label: 'Website Analytics', href: '/admin/ecommerce/website-analytics' }],
      followUps: ['How many e-commerce orders were placed today?', 'Compare website sales with offline sales'],
    };
  }

  const data = report.data;
  const cards = data.kpis?.cards || [];
  const cardValue = (key) => cards.find((card) => card.key === key);
  const formatCard = (card) => {
    if (!card || card.value === null || card.value === undefined) return 'Not available';
    if (card.format === 'currency') return money(card.value);
    if (card.format === 'percent') return plainPct(card.value);
    return count(card.value);
  };

  const visitorsCard = cardValue('visitors');
  const sessionsCard = cardValue('sessions');
  const conversionCard = cardValue('conversion');
  const funnel = data.funnel || { stages: [], mode: 'page_views' };
  const trend = Array.isArray(data.trend?.days) ? data.trend.days : [];

  return {
    tool: 'getWebsiteAnalytics',
    questionType: 'website_analytics',
    title: `Website analytics · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('sessions', 'Website sessions', formatCard(sessionsCard), {
        change: sessionsCard?.change ?? null,
        note: sessionsCard?.note || '',
      }),
      kpi('visitors', 'Unique visitors', formatCard(visitorsCard), {
        change: visitorsCard?.change ?? null,
        note: visitorsCard?.note || (visitorsCard?.unavailable ? 'The storefront tracker has not collected visitor identifiers.' : ''),
      }),
      kpi('conversion', 'Session conversion', formatCard(conversionCard), {
        change: conversionCard?.change ?? null,
        changeLabel: conversionCard?.change == null ? '' : `${Number(conversionCard.change).toFixed(1)} pp`,
        note: conversionCard?.note || '',
      }),
      kpi('orders', 'Website orders', count(data.trend?.totals?.orders ?? 0)),
      kpi('revenue', 'Website revenue', money(data.trend?.totals?.revenue ?? 0)),
      kpi('registrations', 'Registrations', data.accounts?.available ? count(data.accounts.registrations) : 'Not available', {
        note: data.accounts?.available ? '' : (data.accounts?.note || 'Shop-wide account data is hidden on a branch-restricted view.'),
      }),
    ],
    tables: [
      table('Conversion funnel', [
        { key: 'label', label: 'Stage', format: 'text' },
        { key: 'count', label: 'Count', format: 'number', align: 'right' },
        { key: 'unit', label: 'Unit', format: 'text' },
        { key: 'conversion', label: 'From previous', format: 'percent', align: 'right' },
      ], funnel.stages.map((stage) => ({
        label: stage.label,
        count: stage.count,
        unit: stage.unit,
        conversion: stage.conversion,
      })), funnel.mode === 'visitors'
        ? 'Visitor stages are counted once per unique visitor by the storefront tracker.'
        : 'Page-view funnel. Unique-visitor conversion needs the storefront tracker.'),
      table('Traffic by page type', [
        { key: 'label', label: 'Page type', format: 'text' },
        { key: 'views', label: 'Views', format: 'number', align: 'right' },
        { key: 'sessions', label: 'Sessions', format: 'number', align: 'right' },
      ], (data.pageTypes || []).map((row) => ({
        label: row.label, views: row.views, sessions: row.sessions,
      }))),
    ],
    charts: [
      line('Daily sessions and page views', trend.map((row) => formatDate(row.date)), [
        { name: 'Sessions', points: trend.map((row) => row.sessions) },
        { name: 'Page views', points: trend.map((row) => row.pageViews) },
      ], 'number'),
    ],
    facts: {
      period: period.label,
      sessions: data.trend?.totals?.sessions ?? 0,
      pageViews: data.trend?.totals?.pageViews ?? 0,
      visitors: data.trend?.totals?.visitors ?? null,
      visitorsAvailable: Boolean(visitorsCard && visitorsCard.value !== null),
      orders: data.trend?.totals?.orders ?? 0,
      revenue: data.trend?.totals?.revenue ?? 0,
      conversion: conversionCard?.value ?? null,
      registrations: data.accounts?.available ? data.accounts.registrations : null,
      accountsNote: data.accounts?.note || '',
      tracker: data.meta?.tracking || null,
      funnel: funnel.stages.map((stage) => ({
        label: stage.label, count: stage.count, unit: stage.unit, conversion: stage.conversion,
      })),
      note: 'Website orders are the storefront view. The consolidated sales figure excludes orders already invoiced in ERP.',
    },
    limitations: [
      ...(data.meta?.tracking?.installed
        ? ['Unique visitors come from the first-party tracker. One person on two browsers counts as two visitors.']
        : ['The storefront tracker has not collected any events yet, so unique visitors and visitor-level conversion cannot be measured. Session conversion is orders ÷ sessions, not people.']),
      data.accounts?.available ? '' : 'Shop-wide registration and account figures are hidden because this view is restricted to one branch.',
    ].filter(Boolean),
    sources: ['Storefront visits collection', 'Storefront orders', 'Storefront customers', 'First-party tracker (when installed)'],
    links: [{ label: 'Website Analytics', href: '/admin/ecommerce/website-analytics' }],
    followUps: ['How many e-commerce orders were placed today?', 'Compare website sales with offline sales', 'Which products are selling the most?'],
  };
}

async function runBusinessReport(ctx, args) {
  const period = resolvePeriodArg(ctx, args);
  const filters = resolveFilterArg(ctx, args);

  const [sales, inventory, purchases, outstanding] = await Promise.all([
    salesAnalytics(ctx.scope, filters, period),
    inventoryReport(ctx.scope, filters, { limit: 8 }),
    purchaseReport(ctx.scope, filters, period),
    outstandingReport(ctx.scope, filters),
  ]);

  const topBranch = [...sales.branches].filter((b) => b.businessId).sort((a, b) => b.net - a.net)[0] || null;
  const topChannel = [...sales.channels.rows].filter((c) => c.available).sort((a, b) => b.net - a.net)[0] || null;
  const topProduct = sales.topProducts[0] || null;

  return {
    tool: 'generateBusinessReport',
    questionType: 'business_report',
    title: `Business report · ${period.label}`,
    ...meta(period, filters),
    kpis: [
      kpi('net', 'Net revenue', money(sales.current.net), { change: sales.changes.net }),
      kpi('orders', 'Orders', count(sales.current.orders), { change: sales.changes.orders }),
      kpi('inventory', 'Stock value', money(inventory.totalValue), { note: `${count(inventory.totalUnits)} units in stock.` }),
      kpi('lowStock', 'Low or out of stock', count(inventory.lowStock.length + inventory.outOfStock.length), {
        tone: inventory.lowStock.length + inventory.outOfStock.length ? 'down' : 'flat',
      }),
      kpi('purchases', 'Purchases', money(purchases.total), { note: purchases.source }),
      kpi('payables', 'Payables', money(outstanding.payables)),
      kpi('receivables', 'Receivables', money(outstanding.receivables)),
    ],
    tables: [
      table('Branch performance', [
        { key: 'branchName', label: 'Branch', format: 'text' },
        { key: 'net', label: 'Net revenue', format: 'money', align: 'right' },
        { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
        { key: 'change', label: 'Change', format: 'percent', align: 'right' },
      ], sales.branches.map((b) => ({
        branchName: b.branchName, net: b.net, orders: b.orders, change: b.change,
      })), period.comparison ? `Compared with ${period.comparison.label}.` : ''),
      table('Top products', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'qty', label: 'Units', format: 'units', align: 'right' },
        { key: 'revenue', label: 'Revenue', format: 'money', align: 'right' },
      ], sales.topProducts.slice(0, 8).map((row) => ({ name: row.name, qty: row.qty, revenue: row.revenue }))),
      table('Stock alerts', [
        { key: 'name', label: 'Product', format: 'text' },
        { key: 'stock', label: 'Stock', format: 'units', align: 'right' },
        { key: 'sold28', label: 'Sold 28d', format: 'units', align: 'right' },
        { key: 'daysCover', label: 'Days cover', format: 'number', align: 'right' },
      ], [...inventory.lowStock, ...inventory.outOfStock].slice(0, 10).map((row) => ({
        name: row.name, stock: row.stock, sold28: row.sold28, daysCover: row.daysCover,
      }))),
      table('Supplier payables', [
        { key: 'name', label: 'Supplier', format: 'text' },
        { key: 'value', label: 'Purchased value', format: 'money', align: 'right' },
      ], outstanding.suppliers.slice(0, 5)),
    ],
    charts: [
      line('Daily sales and returns', sales.daily.labels, [
        { name: 'Sales', points: sales.daily.sales },
        { name: 'Returns', points: sales.daily.returns },
      ], 'money'),
      donut('Revenue by channel', sales.channels.rows, 'money'),
      bar('Net revenue by branch', sales.branches.map((b) => ({ label: b.branchName, value: b.net })), 'money'),
    ],
    facts: {
      period: period.label,
      comparison: period.comparison?.label || null,
      net: sales.current.net,
      gross: sales.current.grossSales + sales.current.websiteRevenue,
      returns: sales.current.returns,
      orders: sales.current.orders,
      aov: sales.current.aov,
      change: sales.changes.net,
      previousNet: sales.previous.net,
      topBranch: topBranch ? { name: topBranch.branchName, net: topBranch.net } : null,
      topChannel: topChannel ? { label: topChannel.label, net: topChannel.net } : null,
      topProduct: topProduct ? { name: topProduct.name, revenue: topProduct.revenue } : null,
      inventory: {
        value: inventory.totalValue, units: inventory.totalUnits,
        lowStock: inventory.lowStock.length, outOfStock: inventory.outOfStock.length,
        topAlerts: inventory.lowStock.slice(0, 3).map((row) => ({ name: row.name, stock: row.stock })),
      },
      purchases: { total: purchases.total, source: purchases.source, pending: purchases.pendingInPeriod },
      outstanding: { payables: outstanding.payables, receivables: outstanding.receivables, net: outstanding.netPosition },
      websiteRevenue: sales.current.websiteRevenue,
      counts: sales.counts,
      channels: sales.channels.rows,
      branches: sales.branches.map((b) => ({ name: b.branchName, net: b.net, share: b.share, change: b.change })),
    },
    limitations: [
      ...new Set([...sales.limitations, ...inventory.limitations, ...purchases.limitations, ...outstanding.limitations]),
    ],
    sources: [
      ...SALES_SOURCES, ...(sales.website.available ? WEBSITE_SOURCES : []),
      'ERP barcode stock rows', 'ERP purchase invoices', 'ERP vouchers',
    ],
    links: [
      { label: 'Sales Report', href: '/admin/reports/sales-report' },
      { label: 'Item Stock', href: '/admin/reports/item-stock' },
      { label: 'Supplier Outstanding', href: '/admin/reports/supplier-outstanding' },
    ],
    followUps: ['Which products should we reorder?', 'Compare sales across all four branches', 'Show our pending purchases and outstanding payments'],
  };
}

const RUNNERS = {
  getSalesSummary: runSalesSummary,
  getSalesByBranch: runSalesByBranch,
  getSalesByChannel: runSalesByChannel,
  getTopSellingProducts: runTopProducts,
  getInventorySummary: runInventorySummary,
  getLowStockProducts: runLowStock,
  getProductPerformance: runProductPerformance,
  getPurchaseSummary: runPurchaseSummary,
  getOutstandingBalances: runOutstanding,
  getCustomerAnalytics: runCustomers,
  getEcommerceOrderSummary: runEcommerce,
  getWebsiteAnalytics: runWebsite,
  generateBusinessReport: runBusinessReport,
};

export async function runTool(name, args, ctx) {
  const tool = findTool(name);
  if (!tool) throw new DataError(422, `Unknown tool "${name}".`, 'UNKNOWN_TOOL');
  const clean = validateArgs(tool, args);
  const startedAt = Date.now();
  const result = await RUNNERS[name](ctx, clean);
  return {
    ...result,
    meta: {
      ...(result.meta || {}),
      tool: name,
      durationMs: Date.now() - startedAt,
    },
  };
}
