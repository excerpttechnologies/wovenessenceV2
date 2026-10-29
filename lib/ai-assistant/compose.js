/* Grounded answer composition.

   The prose below is assembled from the numbers a tool returned - never from
   a template with placeholders that might be left unfilled, and never from a
   model's memory. Every sentence that quotes a figure reads it from `facts`.
   When a figure is missing (a prior period with no data, a tracker that is
   not installed), the sentence says that instead of printing a confident 0.

   The AI provider may replace `summary` with its own wording. It receives
   these same facts and is instructed to use only them. The KPIs, tables and
   charts always come from the tool result, so a model cannot alter a number
   that appears in a visual.
   ========================================================================== */

import { SUGGESTED_QUESTIONS } from './intent';
import { formatINR, formatNumber, formatPercent } from '@/lib/dashboard/format';

const money = (value) => formatINR(value);
const count = (value) => formatNumber(value);
const pct = (value) => (value === null || value === undefined ? 'N/A' : formatPercent(value, { signed: true }));
const share = (value) => (value === null || value === undefined ? 'N/A' : formatPercent(value));

function trendWord(change) {
  if (change === null || change === undefined) return null;
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

function salesParagraph(facts) {
  if (!facts.orders && !facts.net) {
    return `No sales were recorded for **${facts.period}** in this scope. The figures below are a real zero from the selected sales documents, not an unavailable data source.`;
  }

  const change = trendWord(facts.change);
  let opening;
  if (change && facts.change !== 0) {
    /* Only name the comparison when the data layer produced one. A change
       against an unknown prior period is not something to narrate. */
    const against = facts.comparison
      ? ` compared with ${facts.comparison} (previously ${money(facts.previousNet)})`
      : ' on the preceding window';
    opening = `Net revenue for **${facts.period}** was **${money(facts.net)}**, ${change} **${pct(Math.abs(facts.change))}**${against}.`;
  } else if (change === 0) {
    opening = `Net revenue for **${facts.period}** was **${money(facts.net)}**, unchanged from ${facts.comparison || 'the previous period'}.`;
  } else {
    opening = `Net revenue for **${facts.period}** was **${money(facts.net)}**.`;
  }

  const parts = [opening];

  parts.push(`Gross sales were ${money(facts.gross)}, returns ${money(facts.returns)}, leaving ${count(facts.orders)} orders at an average of ${facts.aov === null ? 'no defined average (there were no orders)' : money(facts.aov)}.`);

  if (facts.topBranch) {
    parts.push(`**${facts.topBranch.name}** was the highest-grossing branch at ${money(facts.topBranch.net)}.`);
  }
  if (facts.websiteOrders) {
    parts.push(`The website contributed ${count(facts.websiteOrders)} qualifying orders worth ${money(facts.websiteRevenue)}; storefront orders already invoiced in ERP are excluded.`);
  }
  if (facts.instagramNet) {
    parts.push(`Instagram-tagged bills accounted for ${money(facts.instagramNet)}.`);
  }

  return parts.join(' ');
}

function branchParagraph(facts) {
  if (!facts.totalNet) {
    return `No branch recorded a sale for **${facts.period}** in this scope.`;
  }
  const rows = (facts.branches || []).filter((row) => row.net || row.orders);
  const [first, second, third] = rows;
  const parts = [];

  if (first) {
    parts.push(`**${first.branchName}** generated the most net revenue in **${facts.period}**: **${money(first.net)}** across ${count(first.orders)} orders (${share(first.share)} of the total).`);
  }
  if (second) {
    parts.push(`**${second.branchName}** followed at ${money(second.net)}${third ? `, then **${third.branchName}** at ${money(third.net)}` : ''}.`);
  }
  parts.push(`Combined net revenue across the branches with sales was ${money(facts.totalNet)}.`);

  const mover = rows
    .filter((row) => row.change !== null && row.change !== undefined && row.previousNet > 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (mover && facts.comparison) {
    parts.push(`The largest movement against ${facts.comparison} was **${mover.branchName}** at ${pct(mover.change)}.`);
  }
  if (facts.unassigned?.net) {
    parts.push(`${money(facts.unassigned.net)} of revenue is not mapped to a listed branch and is shown separately.`);
  }
  return parts.join(' ');
}

function channelParagraph(facts) {
  const available = (facts.rows || []).filter((row) => row.available);
  if (!facts.total) {
    return `No revenue was recorded across any channel for **${facts.period}** in this scope.`;
  }
  const ranked = [...available].sort((a, b) => b.net - a.net);
  const best = facts.best || ranked[0];
  const parts = [];

  if (best) {
    parts.push(`**${best.label}** generated the most revenue in **${facts.period}**: **${money(best.net)}**, or ${share(best.share)} of the ${money(facts.total)} total.`);
  }
  const rest = ranked.filter((row) => row.label !== best?.label);
  if (rest.length) {
    parts.push(rest.map((row) => `${row.label} ${money(row.net)} (${share(row.share)})`).join('; ') + '.');
  }
  if (facts.websiteDuplicates) {
    parts.push(`${count(facts.websiteDuplicates)} storefront orders (${money(facts.websiteDuplicateRevenue)}) were excluded because their invoice number already exists in ERP, so the same sale is not counted twice.`);
  }
  const instagram = (facts.rows || []).find((row) => row.label === 'Instagram');
  if (instagram) {
    parts.push('Instagram revenue includes only bills saved with Sales Channel = Instagram at billing; nothing is inferred from a customer name or note.');
  }
  return parts.join(' ');
}

function topProductsParagraph(facts) {
  if (!facts.rows?.length) {
    return `No product sold in **${facts.period}** within this scope, so there is nothing to rank.${facts.category ? ` The request was filtered to "${facts.category}".` : ''}`;
  }
  const [first, second, third] = facts.rows;
  const parts = [
    `**${first.name}**${first.code ? ` (${first.code})` : ''} was the top seller in **${facts.period}**, with **${money(first.revenue)}** from ${count(first.qty)} units.`,
  ];
  if (second) {
    parts.push(`${second.name} came next at ${money(second.revenue)}${third ? `, then ${third.name} at ${money(third.revenue)}` : ''}.`);
  }
  parts.push(`The ${count(facts.rows.length)} listed products account for ${money(facts.totalTopRevenue)} of line revenue before returns.`);
  if (facts.category) parts.push(`The list is filtered to products matching "${facts.category}".`);
  return parts.join(' ');
}

function inventoryParagraph(facts) {
  if (!facts.itemCount) {
    return 'There are no barcode stock rows in this scope, so an inventory position cannot be produced. This is a missing source, not zero stock.';
  }
  const parts = [
    `Stock on hand is **${count(facts.units)} units** across ${count(facts.itemCount)} item codes, valued at **${money(facts.value)}** at purchase cost.`,
  ];
  if (facts.lowStockCount || facts.outOfStockCount) {
    parts.push(`${count(facts.lowStockCount)} product(s) are at or below ${facts.threshold ?? 5} units and ${count(facts.outOfStockCount)} have no stock left.`);
  } else {
    parts.push('No product is below the low-stock line.');
  }
  if (facts.category) parts.push(`The view is filtered to "${facts.category}".`);
  parts.push('Valuation uses the barcode unit cost (final net, falling back to purchase rate); it is not a selling-price valuation.');
  return parts.join(' ');
}

function lowStockParagraph(facts) {
  const parts = [];
  if (!facts.lowStockCount && !facts.outOfStockCount) {
    return `No product in this scope is low or out of stock${facts.category ? ` in "${facts.category}"` : ''}. Low stock means ${facts.threshold} units or fewer.`;
  }
  parts.push(`**${count(facts.lowStockCount)}** product(s) are at or below ${facts.threshold} units${facts.category ? ` in "${facts.category}"` : ''}, and **${count(facts.outOfStockCount)}** are out of stock.`);

  if (facts.lowStock?.length) {
    parts.push(`Lowest cover: ${facts.lowStock.slice(0, 4).map((row) => `${row.name} (${count(row.stock)} in stock${row.daysCover !== null && row.daysCover !== undefined ? `, about ${row.daysCover} days` : ''})`).join('; ')}.`);
  }
  if (facts.outOfStock?.length) {
    parts.push(`Out of stock: ${facts.outOfStock.slice(0, 4).map((row) => row.name).join(', ')}.`);
  }
  if (facts.reorder?.length) {
    parts.push(`A reorder of ${facts.reorder.slice(0, 4).map((row) => `${row.name} ×${count(row.suggestedQty)}`).join(', ')} would target ${facts.coverDays} days of cover at the recent sales rate.`);
  }
  parts.push('These are suggestions, not facts: the ERP has no configured reorder threshold, so low stock is the 5-unit line and cover uses sales from the last 28 days.');
  return parts.join(' ');
}

function productPerformanceParagraph(facts) {
  const parts = [];
  if (facts.rows?.length) {
    const first = facts.rows[0];
    parts.push(`**${first.name}** led product revenue in **${facts.period}** at ${money(first.revenue)} from ${count(first.qty)} units.`);
  } else {
    parts.push(`No product sale was recorded for **${facts.period}**.`);
  }
  if (facts.highStockLowSales?.length) {
    parts.push(`${count(facts.highStockLowSales.length)} high-stock product(s) sold nothing in the period: ${facts.highStockLowSales.slice(0, 4).map((row) => `${row.name} (${count(row.stock)} units, ${money(row.value)} at cost)`).join('; ')}.`);
    parts.push('That is where working capital is sitting longest; the stock table below lists them with their holding value.');
  } else if (facts.highStockLowSales) {
    parts.push('No high-stock product had zero sales in the period.');
  }
  return parts.join(' ');
}

function purchaseParagraph(facts) {
  const parts = [
    `Purchases for **${facts.period}** totalled **${money(facts.total)}** from ${count(facts.invoiceCount || facts.grcCount)} ${facts.source.toLowerCase()}.`,
  ];
  if (facts.topSupplier) {
    parts.push(`The largest supplier was **${facts.topSupplier.supplier}** at ${money(facts.topSupplier.value)}.`);
  }
  if (facts.pendingInPeriod) {
    parts.push(`${count(facts.pendingInPeriod)} GRC(s) worth ${money(facts.pendingValue)} were received in the period but not yet converted to a purchase invoice.`);
  } else {
    parts.push('Every GRC received in the period has been converted to a purchase invoice.');
  }
  if (facts.pendingAll) {
    parts.push(`${count(facts.pendingAll)} GRC(s) remain unconverted across all dates in scope.`);
  }
  return parts.join(' ');
}

function outstandingParagraph(facts) {
  const parts = [
    `As things stand, **${money(facts.payables)}** is payable to suppliers and **${money(facts.receivables)}** is receivable from customers, a net position of **${money(facts.net)}** in ${facts.net >= 0 ? 'your favour' : 'the suppliers\' favour'}.`,
  ];
  if (facts.topSupplier) {
    parts.push(`The largest supplier exposure is ${facts.topSupplier.name} at ${money(facts.topSupplier.value)} of purchases.`);
  }
  if (facts.topCustomer) {
    parts.push(`${facts.topCustomer.name} carries the largest unpaid customer balance at ${money(facts.topCustomer.value)} across ${count(facts.topCustomer.bills)} bill(s).`);
  } else {
    parts.push('No POS bill has an unpaid balance in this scope.');
  }
  parts.push('These are current balances, not a period figure; invoice-level allocation is not recorded, so vouchers are netted at document level.');
  return parts.join(' ');
}

function customerParagraph(facts) {
  if (!facts.buyers) {
    return `No identified customer bought anything in **${facts.period}** within this scope. Walk-in bills with no customer attached cannot be counted as distinct buyers.`;
  }
  const parts = [
    `**${count(facts.buyers)}** identified customer(s) bought in **${facts.period}**, of which **${count(facts.newBuyers)}** were new and **${count(facts.returningBuyers)}** returning.`,
  ];
  if (facts.repeatRate !== null) parts.push(`The repeat rate was ${share(facts.repeatRate)}.`);
  if (facts.averageSpend !== null) parts.push(`Average spend per buyer was ${money(facts.averageSpend)}.`);
  if (facts.top) parts.push(`**${facts.top.name}** was the largest customer at ${money(facts.top.value)}.`);
  parts.push('Buyers are identified by customer id or storefront account; a walk-in bill with no customer attached cannot be counted.');
  return parts.join(' ');
}

function ecommerceParagraph(facts) {
  if (facts.available === false) {
    return `Storefront orders cannot be read for this scope: ${facts.reason || 'no storefront branch is linked to this account.'}`;
  }
  const parts = [
    `**${count(facts.orders)}** storefront order(s) qualified as sales in **${facts.period}**, worth **${money(facts.revenue)}**${facts.aov !== null ? ` at an average of ${money(facts.aov)}` : ''}.`,
  ];
  if (facts.pendingPayment) parts.push(`${count(facts.pendingPayment)} order(s) are awaiting payment and are excluded from revenue.`);
  if (facts.cancelled) parts.push(`${count(facts.cancelled)} were cancelled (${money(facts.cancelledValue)}).`);
  if (facts.duplicatesExcluded) parts.push(`${count(facts.duplicatesExcluded)} order(s) already invoiced in ERP were excluded so the same sale is not counted twice.`);
  if (facts.topProduct) parts.push(`The best-selling online product was ${facts.topProduct.name} at ${money(facts.topProduct.revenue)}.`);
  if (facts.registrations !== null && facts.registrations !== undefined) {
    parts.push(`${count(facts.registrations)} storefront account(s) registered in the period.`);
  }
  return parts.join(' ');
}

function websiteParagraph(facts) {
  if (facts.available === false) {
    return `Website analytics cannot be read for this scope: ${facts.reason || 'the analytics source is unavailable.'}`;
  }
  const parts = [
    `The storefront recorded **${count(facts.sessions)} sessions** and ${count(facts.pageViews)} page views in **${facts.period}**.`,
  ];
  if (facts.visitorsAvailable) {
    parts.push(`${count(facts.visitors)} unique visitor(s) were seen by the first-party tracker.`);
  } else {
    parts.push('Unique visitors cannot be measured yet: the first-party tracker has not collected any events, so sessions are the honest traffic measure.');
  }
  if (facts.conversion !== null && facts.conversion !== undefined) {
    parts.push(`Session conversion was ${share(facts.conversion)} (orders ÷ sessions, not people).`);
  }
  const funnel = facts.funnel || [];
  if (funnel.length >= 2) {
    const from = funnel[0];
    const to = funnel[funnel.length - 1];
    parts.push(`Funnel: ${count(from.count)} ${from.unit} at "${from.label}" down to ${count(to.count)} ${to.unit} at "${to.label}".`);
  }
  if (facts.registrations !== null && facts.registrations !== undefined) {
    parts.push(`${count(facts.registrations)} account(s) registered in the period.`);
  }
  if (!facts.visitorsAvailable) {
    parts.push('Visitor-level conversion, guest browsers and new-versus-returning splits need the storefront tracker installed on wovenessence.in.');
  }
  return parts.join(' ');
}

function reportParagraph(facts) {
  const parts = [];
  parts.push(`**Sales.** ${salesParagraph({
    ...facts,
    topBranch: facts.topBranch,
    topChannel: facts.topChannel,
    orders: facts.orders,
    websiteOrders: facts.counts?.websiteOrders || 0,
  })}`);
  parts.push(`**Inventory.** Stock on hand is ${count(facts.inventory.units)} units valued at ${money(facts.inventory.value)}; ${count(facts.inventory.lowStock)} product(s) are low and ${count(facts.inventory.outOfStock)} out of stock.`);
  parts.push(`**Purchases.** ${money(facts.purchases.total)} was purchased (${facts.purchases.source})${facts.purchases.pending ? `, with ${count(facts.purchases.pending)} GRC(s) awaiting a purchase invoice` : ''}.`);
  parts.push(`**Balances.** ${money(facts.outstanding.payables)} payable, ${money(facts.outstanding.receivables)} receivable.`);

  const actions = [];
  if (facts.inventory.topAlerts?.length) {
    actions.push(`review stock cover on ${facts.inventory.topAlerts.map((row) => row.name).join(', ')}`);
  }
  if (facts.topChannel && facts.topChannel.label === 'E-commerce website') {
    actions.push('protect website stock levels, since that is the leading channel this period');
  } else if (facts.topBranch) {
    actions.push(`check whether ${facts.topBranch.name}'s mix can be repeated in the weaker branches`);
  }
  if (facts.outstanding.payables > facts.outstanding.receivables) {
    actions.push('prioritise collections: payables exceed receivables');
  }
  if (actions.length) parts.push(`**Suggested next step.** Consider ${actions.join('; ')}.`);

  return parts.join('\n\n');
}

const HELP = [
  'I am the **Woven Essence AI Business Assistant**. I answer from your ERP and storefront records - I do not guess figures.',
  'I can report on sales (by day, branch, channel, product), inventory and stock alerts, purchases and payables, customer balances and repeat buying, storefront orders, and website traffic and conversion.',
  'Ask in plain language, for example:',
  SUGGESTED_QUESTIONS.slice(0, 6).map((question) => `- ${question}`).join('\n'),
  'If a source is not configured - website visitor tracking, for example - I will say so rather than print a number.',
].join('\n\n');

function clarification(period, filters) {
  return [
    `I could not place that question in a business area I can answer from the ERP. I can help with sales, branches, channels, products, inventory, purchases, payables and receivables, customers, storefront orders and website traffic.`,
    `Try one of these for **${period.label}**${filters?.branchLabel ? ` (${filters.branchLabel})` : ''}:`,
    SUGGESTED_QUESTIONS.slice(0, 5).map((question) => `- ${question}`).join('\n'),
  ].join('\n\n');
}

const COMPOSERS = {
  sales_summary: salesParagraph,
  sales_by_branch: branchParagraph,
  sales_by_channel: channelParagraph,
  top_products: topProductsParagraph,
  inventory_summary: inventoryParagraph,
  low_stock: lowStockParagraph,
  product_performance: productPerformanceParagraph,
  purchase_summary: purchaseParagraph,
  outstanding_balances: outstandingParagraph,
  customer_analytics: customerParagraph,
  ecommerce_orders: ecommerceParagraph,
  website_analytics: websiteParagraph,
  business_report: reportParagraph,
};

function uniqueBy(list, key) {
  const seen = new Set();
  return (list || []).filter((item) => {
    const value = typeof key === 'function' ? key(item) : item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function mergeToolResults(results, questionType) {
  const primary = results.find((result) => result.questionType === questionType) || results[0];
  const kpis = [];
  const seen = new Set();
  results.forEach((result) => {
    (result.kpis || []).forEach((card) => {
      const key = `${result.tool}:${card.key}`;
      if (seen.has(key)) return;
      seen.add(key);
      kpis.push(card);
    });
  });

  return {
    primary,
    kpis,
    tables: results.flatMap((result) => result.tables || []),
    charts: results.flatMap((result) => result.charts || []),
    limitations: [...new Set(results.flatMap((result) => result.limitations || []).filter(Boolean))],
    sources: [...new Set(results.flatMap((result) => result.sources || []).filter(Boolean))],
    links: uniqueBy(results.flatMap((result) => result.links || []), 'href'),
    followUps: [...new Set(results.flatMap((result) => result.followUps || []))].slice(0, 4),
  };
}

export function composeAnswer({
  plan,
  results,
  question,
  period,
  filters,
  mode = 'deterministic',
  provider = null,
  model = null,
  summaryOverride = '',
  toolCalls = [],
}) {
  const questionType = plan.questionType;
  const merged = results.length ? mergeToolResults(results, questionType) : null;
  const primary = merged?.primary || null;

  let summary;
  if (questionType === 'help') summary = HELP;
  else if (questionType === 'clarify' || !results.length) {
    summary = clarification(period, filters);
  } else {
    const writer = COMPOSERS[questionType] || COMPOSERS.sales_summary;
    summary = summaryOverride || writer(primary.facts, primary);
  }

  const limitations = merged?.limitations || [];
  const metadata = {
    generatedAt: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    period: primary?.period || {
      from: period.start,
      to: period.end,
      label: period.label,
      days: period.days,
      preset: period.preset,
      comparison: period.comparison
        ? {
          from: period.comparison.start,
          to: period.comparison.end,
          label: period.comparison.label,
        }
        : null,
    },
    filters: primary?.filters || {
      company: filters.companyLabel,
      branch: filters.branchLabel,
      channel: filters.channelLabel,
    },
    sources: merged?.sources || [],
    isComplete: primary ? primary.facts?.available !== false : false,
    question,
    tools: toolCalls.length
      ? toolCalls
      : (plan.tools || []).map((tool) => ({ name: tool.name, ok: true })),
    reasoning: {
      mode,
      provider,
      model,
    },
  };

  return {
    success: true,
    questionType,
    title: primary?.title || (questionType === 'help' ? 'How I can help' : 'Business assistant'),
    summary,
    kpis: merged?.kpis || [],
    tables: merged?.tables || [],
    charts: merged?.charts || [],
    data: primary?.facts || {},
    metadata,
    limitations,
    links: merged?.links || [],
    followUps: merged?.followUps?.length ? merged.followUps : SUGGESTED_QUESTIONS.slice(0, 3),
    clarification: questionType === 'clarify',
  };
}
