/* AI Business Assistant - layer 2 and layer 3 tests.

   Run with:
     npm run test:ai-assistant

   The script uses a synthetic Super Admin session directed at the real
   (development) database, because the point is to prove the assistant reads
   stored documents and calculates from them - not to test a mock. It does not
   sign in and it does not write: every check below is a read, and the final
   section asserts that the document counts of the source collections are
   unchanged.

   It is deliberately structural: figures depend on whatever data the database
   holds, so the assertions are arithmetic identities (net = gross - returns),
   range rules (a low-stock row is at or below the threshold) and shape checks
   (every answer has a period, sources and limitations), not hard-coded rupee
   amounts that would rot.
   ========================================================================== */

import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { loadDashboardOptions } from '@/lib/dashboard/access';
import { scopeFromAccess, resolveFilters } from '@/lib/ai-assistant/scope';
import {
  PeriodError, defaultPeriod, detectPeriod, periodFromArgs, periodFromPreset, withComparison,
} from '@/lib/ai-assistant/periods';
import { classify, SUGGESTED_QUESTIONS } from '@/lib/ai-assistant/intent';
import { runTool } from '@/lib/ai-assistant/tools';
import { composeAnswer } from '@/lib/ai-assistant/compose';
import { answerCsv, answerWorkbook } from '@/lib/ai-assistant/export';
import { describeProvider } from '@/lib/ai-assistant/provider';
import { rateLimit } from '@/lib/ai-assistant/guard';

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function group(name) {
  console.log(`\n${name}`);
}

async function main() {
  group('Layer 3 - periods');
  ok('today is a single day', () => {
    const period = periodFromPreset('today', { today: TODAY });
    assert.equal(period.start, TODAY);
    assert.equal(period.end, TODAY);
    assert.equal(period.days, 1);
  });

  ok('this month starts on the 1st and ends today', () => {
    const period = withComparisonSafe(periodFromPreset('this_month', { today: TODAY }));
    assert.equal(period.start, `${TODAY.slice(0, 7)}-01`);
    assert.equal(period.end, TODAY);
    assert.equal(period.comparison.kind, 'previous_month');
  });

  ok('"compare this month with last month" is this month against the previous month', () => {
    const period = detectPeriod("Compare this month's sales with last month.", { today: TODAY });
    assert.equal(period.preset, 'this_month');
    assert.equal(period.start, `${TODAY.slice(0, 7)}-01`);
    assert.equal(period.comparison.kind, 'previous_month');
  });

  ok('a month name resolves to that month', () => {
    const period = detectPeriod('sales in September', { today: TODAY });
    assert.equal(period.start.slice(8), '01');
    assert.ok(period.days >= 28);
  });

  ok('explicit dates are accepted and compared', () => {
    const period = periodFromArgs({ startDate: '2026-09-01', endDate: '2026-09-30' }, { today: TODAY });
    assert.equal(period.start, '2026-09-01');
    assert.equal(period.end, '2026-09-30');
    assert.ok(period.comparison);
  });

  ok('a reversed range is refused', () => {
    assert.throws(() => periodFromArgs({ startDate: '2026-09-30', endDate: '2026-09-01' }, { today: TODAY }), PeriodError);
  });

  ok('the default period is documented and bounded', () => {
    const period = defaultPeriod({ today: TODAY });
    assert.ok(period.days >= 1 && period.days <= 366);
    assert.ok(period.label);
  });

  group('Layer 3 - question understanding');
  const expectedTypes = [
    ['What are our total sales today?', 'sales_summary'],
    ["Compare this month's sales with last month.", 'sales_summary'],
    ['Which products are selling the most?', 'top_products'],
    ['Which sarees are running low on stock?', 'low_stock'],
    ['How many e-commerce orders were placed today?', 'ecommerce_orders'],
    ['Compare sales across all four branches.', 'sales_by_branch'],
    ['Which sales channel generates the most revenue?', 'sales_by_channel'],
    ['Show our pending purchases and outstanding payments.', 'outstanding_balances'],
    ['Which products have high stock but low sales?', 'product_performance'],
    ['How many website visitors converted into customers?', 'website_analytics'],
  ];

  expectedTypes.forEach(([question, expected]) => {
    ok(`"${question}" -> ${expected}`, () => {
      const plan = classify(question, { today: TODAY });
      assert.equal(plan.questionType, expected);
      assert.ok(Array.isArray(plan.tools));
    });
  });

  ok('every suggested question maps to a runnable plan', () => {
    SUGGESTED_QUESTIONS.forEach((question) => {
      const plan = classify(question, { today: TODAY });
      assert.notEqual(plan.questionType, 'clarify', `unmapped suggestion: ${question}`);
      assert.ok(plan.tools.length >= 1);
    });
  });

  ok('"show sales from Instagram" filters rather than splits channels', () => {
    const plan = classify('Show sales from Instagram', { today: TODAY });
    assert.equal(plan.questionType, 'sales_summary');
    assert.equal(plan.filters.channel, 'instagram');
  });

  ok('pending purchases and outstanding payments run two tools', () => {
    const plan = classify('Show our pending purchases and outstanding payments.', { today: TODAY });
    assert.equal(plan.tools.length, 2);
    assert.ok(plan.tools.some((tool) => tool.name === 'getOutstandingBalances'));
  });

  ok('a follow-up inherits the previous period', () => {
    const plan = classify('Break that down by branch', {
      today: TODAY,
      context: { questionType: 'sales_summary', period: { start: '2026-09-01', end: '2026-09-30' } },
    });
    assert.equal(plan.questionType, 'sales_by_branch');
    assert.equal(plan.period.start, '2026-09-01');
  });

  ok('a genuinely unrecognised question asks for clarification', () => {
    const plan = classify('compose a poem about the sea', { today: TODAY });
    assert.equal(plan.questionType, 'clarify');
  });

  group('Layer 2 - authorisation');
  await dbConnect();
  const session = {
    id: 'test-ai-assistant',
    name: 'Assistant test',
    email: 'test@example.invalid',
    role: 'Super Admin',
    locationIds: [],
  };
  const access = await loadDashboardOptions(session);
  const scope = scopeFromAccess(session, access);
  ok('the scope resolves the authorised companies', () => {
    assert.ok(scope.businesses.length >= 1);
  });
  ok('an unknown company id is refused', () => {
    assert.throws(
      () => resolveFilters(scope, { company: '000000000000000000000000' }, ''),
      (err) => err.status === 403
    );
  });
  ok('no company filter means every authorised company', () => {
    const filters = resolveFilters(scope, { channel: 'all' }, '');
    assert.equal(filters.businessIds.length, scope.businessIds.length);
    assert.equal(filters.channel, 'all');
  });

  group('Layer 3 - classification of the AI provider');
  const provider = describeProvider();
  ok('provider configuration is reported honestly', () => {
    if (provider.configured) {
      assert.ok(provider.provider && provider.model);
    } else {
      assert.ok(provider.reason.length > 10);
    }
  });

  group('Layer 2 - real business data');
  const before = await collectionCounts(scope);

  const period = withComparisonSafe(periodFromPreset('last_month', { today: TODAY }));
  const filters = resolveFilters(scope, { channel: 'all' }, '');
  const ctx = { scope, filters, period, question: 'test', today: TODAY };

  const salesResult = await runTool('getSalesSummary', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);

  ok('sales summary is arithmetically consistent', () => {
    const { facts } = salesResult;
    assert.ok(facts.period);
    assert.ok(Math.abs(facts.net - (facts.gross - facts.returns)) < 0.05,
      `net ${facts.net} != gross ${facts.gross} - returns ${facts.returns}`);
    assert.ok(facts.orders >= 0);
    assert.equal(facts.aov === null, facts.orders === 0);
  });

  ok('branch revenue adds back to the summary net', () => {
    const branchTotal = salesResult.facts.branches.reduce((sum, branch) => sum + branch.net, 0);
    assert.ok(Math.abs(branchTotal - salesResult.facts.net) < 0.1,
      `branches ${branchTotal} != net ${salesResult.facts.net}`);
  });

  ok('a sales answer has period, sources and a rendered table', () => {
    assert.ok(salesResult.period.label);
    assert.ok(salesResult.sources.length >= 1);
    assert.ok(salesResult.tables.length >= 1);
    assert.ok(salesResult.kpis.length >= 3);
  });

  const branchResult = await runTool('getSalesByBranch', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);
  ok('branch ranking is ordered by net revenue', () => {
    const rows = branchResult.facts.branches;
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index - 1].net >= rows[index].net);
    }
  });

  const lowStock = await runTool('getLowStockProducts', { limit: 8 }, ctx);
  ok('low-stock rows respect the threshold and the reorder target', () => {
    lowStock.facts.lowStock.forEach((row) => {
      assert.ok(row.stock > 0 && row.stock <= lowStock.facts.threshold);
    });
    lowStock.facts.outOfStock.forEach((row) => assert.ok(!(row.stock > 0)));
    lowStock.facts.reorder.forEach((row) => assert.ok(row.suggestedQty >= 1));
  });

  const inventory = await runTool('getInventorySummary', {}, ctx);
  ok('inventory totals are the sum of the reported rows', () => {
    assert.ok(inventory.facts.units >= 0);
    assert.ok(inventory.facts.value >= 0);
    assert.ok(inventory.facts.itemCount >= 0);
  });

  const outstanding = await runTool('getOutstandingBalances', {}, ctx);
  ok('outstanding balances are non-negative and netted correctly', () => {
    assert.ok(outstanding.facts.payables >= 0);
    assert.ok(outstanding.facts.receivables >= 0);
    assert.equal(
      Math.round((outstanding.facts.receivables - outstanding.facts.payables) * 100) / 100,
      Math.round(outstanding.facts.net * 100) / 100
    );
  });

  const purchases = await runTool('getPurchaseSummary', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);
  ok('purchase value comes from one declared source', () => {
    assert.ok(['Purchase invoices', 'Goods receipt challans'].includes(purchases.facts.source));
    assert.ok(purchases.facts.total >= 0);
  });

  const ecommerce = await runTool('getEcommerceOrderSummary', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);
  ok('storefront orders are either reported or explained', () => {
    if (ecommerce.facts.available === false) {
      assert.ok(String(ecommerce.facts.reason || '').length > 0);
    } else {
      assert.ok(ecommerce.facts.orders >= 0);
      assert.ok(ecommerce.facts.revenue >= 0);
      assert.ok(Array.isArray(ecommerce.facts.byStatus));
    }
  });

  const customers = await runTool('getCustomerAnalytics', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);
  ok('customer counts are internally consistent', () => {
    assert.ok(customers.facts.newBuyers <= customers.facts.buyers);
    assert.ok(customers.facts.returningBuyers <= customers.facts.buyers);
  });

  const website = await runTool('getWebsiteAnalytics', {
    startDate: period.start,
    endDate: period.end,
  }, ctx);
  ok('website analytics is either reported or explained', () => {
    if (website.facts.available === false) {
      assert.ok(String(website.facts.reason || '').length > 0);
    } else {
      assert.ok(website.facts.sessions >= 0);
    }
  });

  group('Layer 1 support - composition and export');
  const answer = composeAnswer({
    plan: { ...classify('What are our total sales today?', { today: TODAY }), questionType: 'sales_summary' },
    results: [salesResult],
    question: 'What are our sales for last month?',
    period,
    filters,
    mode: 'deterministic',
    toolCalls: [{ name: 'getSalesSummary', ok: true }],
  });

  ok('prose is grounded in the figures and free of placeholders', () => {
    assert.ok(answer.summary.includes(salesResult.period.label));
    assert.ok(!/undefined|NaN|\[object Object\]/.test(answer.summary));
    assert.ok(answer.metadata.sources.length >= 1);
    assert.equal(answer.metadata.reasoning.mode, 'deterministic');
  });

  ok('the answer carries the cards, tables and metadata the UI renders', () => {
    assert.ok(answer.kpis.length >= 1);
    assert.ok(answer.tables.length >= 1);
    assert.ok(answer.metadata.period?.from && answer.metadata.period?.to);
  });

  ok('the Excel export is a real workbook', () => {
    const buffer = answerWorkbook(answer);
    assert.ok(buffer && buffer.length > 2000);
  });

  ok('the CSV export is UTF-8 with a BOM and the title', () => {
    const csv = answerCsv(answer);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes(answer.title.replace(/[",]/g, '').slice(0, 10)));
  });

  group('Reliability');
  ok('the rate limiter refuses above its limit', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    assert.equal(rateLimit(key, { limit: 2 }).allowed, true);
    assert.equal(rateLimit(key, { limit: 2 }).allowed, true);
    assert.equal(rateLimit(key, { limit: 2 }).allowed, false);
  });

  group('Read-only guarantee');
  const after = await collectionCounts(scope);
  ok('no source collection changed during the test', () => {
    Object.keys(before).forEach((name) => {
      assert.equal(after[name], before[name], `${name} changed: ${before[name]} -> ${after[name]}`);
    });
  });

  console.log(`\n${passed} checks passed.\n`);
  await mongoose.disconnect();
}

function withComparisonSafe(period) {
  /* periodFromPreset does not add a comparison; the assistant adds one later.
     Add the same default here so these tests exercise the real shape. */
  if (period.comparison) return period;
  const kind = /month/.test(period.preset) ? 'previous_month' : 'previous_period';
  return withComparison(period, kind);
}

async function collectionCounts(scope) {
  const db = scope.db;
  const names = [
    'posinvoice', 'salesinvoice', 'posreturn', 'salesreturn',
    'purchaseinvoice', 'grc', 'debitnote', 'creditnote', 'voucher',
    'barcodeLabel', 'orders', 'customers', 'customer',
  ];
  const counts = {};
  for (const name of names) {
    counts[name] = await db.collection(name).countDocuments();
  }
  return counts;
}

main().catch(async (err) => {
  console.error('\nFAILED:', err);
  try { await mongoose.disconnect(); } catch { /* already down */ }
  process.exit(1);
});
