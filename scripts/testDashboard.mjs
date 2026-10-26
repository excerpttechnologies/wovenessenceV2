/* Deterministic tests for the sales dashboard.
 *
 * Run with:
 *   npm run test:dashboard
 *
 * The suite covers the date boundary helpers, zero-safe arithmetic, the
 * location-scoped filter resolver, live analytics against the configured
 * database, and the exported workbook. It does not write to the database.
 */

import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import dbConnect from '@/lib/db';
import mongoose from 'mongoose';
import {
  addDays, addMonthsToDate, buildRange, comparisonRange, defaultPeriod,
  diffDays, endOfMonth, financialYearEnd, financialYearOf, financialYearOptions, financialYearStart,
  isDateString, lastMonthKeys, shiftYear, todayInIndia,
} from '@/lib/dashboard/date.js';
import {
  allocateAmount, averageOrderValue, comparableGrowth, pointChange,
  returnRatePercent, sharePercent, UNASSIGNED_BRANCH,
} from '@/lib/dashboard/calc.js';
import { DashboardError, loadDashboardOptions, parseFilters } from '@/lib/dashboard/access.js';
import { buildDashboardAnalytics, resolveDashboardRequest } from '@/lib/dashboard/service.js';
import { loadOnlineProductMap } from '@/lib/dashboard/storefront.js';
import { buildDashboardWorkbook, dashboardFilename } from '@/lib/dashboard/export.js';
import { channelLabelOf, channelValueOf, normaliseSalesChannel } from '@/lib/salesChannel.js';
import { periodForFinancialYear } from '@/components/dashboard/format.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}`);
    throw err;
  }
}

function approx(actual, expected, tolerance = 0.02) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `expected ${expected}, received ${actual}`
  );
}

function sum(rows, pick) {
  return Number((rows || []).reduce((total, row) => total + (Number(pick(row)) || 0), 0).toFixed(2));
}

function get(data, path) {
  return path.split('.').reduce((value, key) => value?.[key], data);
}

async function main() {
  console.log('\nDate boundaries');
  test('validates real calendar dates only', () => {
    assert.equal(isDateString('2028-02-29'), true);
    assert.equal(isDateString('2027-02-29'), false);
    assert.equal(isDateString('2026-13-01'), false);
    assert.equal(isDateString('2026-1-01'), false);
  });
  test('inclusive range converts to India-day UTC instants', () => {
    const range = buildRange('2026-10-01', '2026-10-01');
    assert.equal(range.days, 1);
    assert.equal(range.startDate.toISOString(), '2026-09-30T18:30:00.000Z');
    assert.equal(range.endExclusive.toISOString(), '2026-10-01T18:30:00.000Z');
  });
  test('leap day is a single inclusive day', () => {
    const range = buildRange('2028-02-29', '2028-03-01');
    assert.equal(range.days, 2);
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2028-02-29', 1), '2028-03-01');
    assert.equal(addMonthsToDate('2028-01-31', 1), '2028-02-29');
  });
  test('Indian financial year turns on 1 April', () => {
    assert.equal(financialYearOf('2026-03-31'), '2025-2026');
    assert.equal(financialYearOf('2026-04-01'), '2026-2027');
    assert.equal(financialYearStart('2026-2027'), '2026-04-01');
    assert.equal(financialYearEnd('2026-2027'), '2027-03-31');
  });
  test('financial year selector includes future years and continues beyond 2029', () => {
    const options = financialYearOptions(new Date('2026-10-24T00:00:00+05:30'));
    const values = options.map((option) => option.value);
    assert.ok(values.includes('2028-2029'));
    assert.ok(values.includes('2029-2030'));
    assert.ok(values.includes('2046-2047'));
  });
  test('default period is the final 30 days of a past FY', () => {
    const period = defaultPeriod('2025-2026', new Date('2026-10-22T00:00:00Z'));
    assert.deepEqual(period, { start: '2026-03-02', end: '2026-03-31' });
    assert.equal(diffDays(period.start, period.end), 29);
  });
  test('future financial year opens on its first day', () => {
    const now = new Date('2026-10-24T00:00:00+05:30');
    assert.deepEqual(periodForFinancialYear('2028-2029', now), {
      startDate: '2028-04-01',
      endDate: '2028-04-01',
    });
    assert.deepEqual(defaultPeriod('2028-2029', now), {
      start: '2028-04-01',
      end: '2028-04-01',
    });
  });
  test('comparison windows keep their length', () => {
    const previous = comparisonRange('2026-10-01', '2026-10-30', 'previous_period');
    assert.equal(previous.days, 30);
    assert.equal(previous.start, '2026-09-01');
    assert.equal(previous.end, '2026-09-30');
    const none = comparisonRange('2026-10-01', '2026-10-30', 'none');
    assert.equal(none, null);
  });
  test('month arithmetic and month keys are deterministic', () => {
    assert.equal(endOfMonth('2028-02'), '2028-02-29');
    assert.equal(endOfMonth('2027-02'), '2027-02-28');
    assert.deepEqual(lastMonthKeys('2026-10-22', 6), [
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    assert.equal(shiftYear('2028-02-29', -1), '2027-02-28');
  });
  test('todayInIndia is a YYYY-MM-DD string', () => {
    assert.equal(isDateString(todayInIndia(new Date('2026-10-22T18:45:00Z'))), true);
  });

  console.log('\nZero-safe arithmetic');
  test('allocations always add back to the document value', () => {
    const parts = allocateAmount(100, [1, 1, 1]);
    approx(parts.reduce((a, b) => a + b, 0), 100);
    const signed = allocateAmount(90, [2, -1, 3]);
    approx(signed.reduce((a, b) => a + b, 0), 90);
    assert.equal(allocateAmount(100, [0, 0]), null);
    assert.equal(allocateAmount(100, []), null);
  });
  test('growth is N/A on a zero or negative prior base', () => {
    assert.equal(comparableGrowth(100, 0), null);
    assert.equal(comparableGrowth(100, -10), null);
    approx(comparableGrowth(120, 100), 20);
  });
  test('channel attribution is explicit and case-insensitive', () => {
    assert.equal(normaliseSalesChannel(' Instagram '), 'instagram');
    assert.equal(normaliseSalesChannel('offline'), '');
    assert.equal(normaliseSalesChannel(null), '');
    assert.equal(channelValueOf({}), '');
    assert.equal(channelLabelOf({ salesChannel: 'instagram' }), 'Instagram');
    assert.equal(channelLabelOf({}), 'Offline Store');
  });
  await testAsync('website product identity comes from the storefront catalog by barcode', async () => {
    const itemId = new mongoose.Types.ObjectId();
    const product = {
      _id: new mongoose.Types.ObjectId(),
      itemId,
      displayName: 'Catalog product',
      barcode: 'WEB-123',
      ecommItemCode: 'SKU-123',
      productType: 'Saree',
    };
    const db = {
      collection(name) {
        if (name === 'items') {
          return {
            find() {
              return {
                project() {
                  return { toArray: async () => [] };
                },
              };
            },
          };
        }
        assert.equal(name, 'ecommerceproduct');
        return {
          find(filter) {
            assert.ok(filter.$or.some((clause) => clause.barcode?.$in?.includes('WEB-123')));
            assert.ok(filter.$or.some((clause) => clause.itemId?.$in?.some((id) => String(id) === String(itemId))));
            return {
              project() {
                return { toArray: async () => [product] };
              },
            };
          },
        };
      },
    };
    const products = await loadOnlineProductMap(db, [{ lines: [{ item: itemId, barcode: 'WEB-123' }] }]);
    assert.equal(products.get('barcode:WEB-123').name, 'Catalog product');
    assert.equal(products.get('barcode:WEB-123').barcode, 'WEB-123');
  });
  test('rates and averages are N/A without a denominator', () => {
    assert.equal(averageOrderValue(1000, 0), null);
    assert.equal(returnRatePercent(1, 0), null);
    approx(returnRatePercent(2, 40), 5);
    approx(sharePercent(25, 100), 25);
    assert.equal(sharePercent(25, 0), 0);
    assert.equal(pointChange(null, 4), null);
    approx(pointChange(6, 4), 2);
  });

  console.log('\nAuthorization and filters');
  await testAsync('dashboard refuses to fall back when MONGODB_URI is absent', async () => {
    const originalUri = process.env.MONGODB_URI;
    try {
      delete process.env.MONGODB_URI;
      await assert.rejects(
        loadDashboardOptions({}),
        (err) => err instanceof DashboardError && err.code === 'DATABASE_NOT_CONFIGURED'
      );
      await assert.rejects(
        resolveDashboardRequest({}, new URLSearchParams()),
        (err) => err instanceof DashboardError && err.code === 'DATABASE_NOT_CONFIGURED'
      );
    } finally {
      if (originalUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = originalUri;
    }
  });
  await dbConnect();
  const db = mongoose.connection.db;
  const branches = await db.collection('branches').find({ isDeleted: { $ne: true } }).toArray();
  assert.equal(branches.length, 4, 'expected four authoritative storefront branches');
  const suvarna = branches.find((b) => b.branchCode === 'TF-0004');
  assert.ok(suvarna, 'Suvarna branch is required for the access test');
  /* companylocation.businessId is stored as an ObjectId, so a string-only
     lookup silently misses and the access test aborts before it runs. */
  const suvarnaBusinessId = String(suvarna.erpBusinessId);
  const suvarnaLocation = await db.collection('companylocation').findOne({
    $or: [
      { businessId: suvarnaBusinessId },
      { businessId: new mongoose.Types.ObjectId(suvarnaBusinessId) },
    ],
  });
  assert.ok(suvarnaLocation, 'Suvarna location is required for the access test');

  const unrestricted = { role: 'Super Admin', locationIds: [] };
  const restricted = { role: 'Location Manager', locationIds: [String(suvarnaLocation._id)] };

  const allAccess = await loadDashboardOptions(unrestricted);
  assert.equal(allAccess.authorizedBranches.length, 4);
  assert.equal(allAccess.authorizedBusinesses.length, 4);

  const oneAccess = await loadDashboardOptions(restricted);
  assert.equal(oneAccess.authorizedBranches.length, 1);
  assert.equal(oneAccess.authorizedBranches[0].branchCode, 'TF-0004');

  const suvarnaFilter = parseFilters(new URLSearchParams({ branch: String(suvarna._id) }), oneAccess);
  assert.equal(suvarnaFilter.branch, String(suvarna._id));
  const other = branches.find((b) => b.branchCode === 'TF-0001');
  assert.throws(
    () => parseFilters(new URLSearchParams({ branch: String(other._id) }), oneAccess),
    (err) => err instanceof DashboardError && err.status === 403
  );
  assert.throws(
    () => parseFilters(new URLSearchParams({ company: 'not-an-id' }), allAccess),
    (err) => err instanceof DashboardError && err.status === 422
  );
  assert.throws(
    () => parseFilters(new URLSearchParams({ channel: 'marketplace' }), allAccess),
    (err) => err instanceof DashboardError && err.status === 422
  );

  const base = {
    financialYear: '2026-2027',
    startDate: '2026-09-23',
    endDate: '2026-10-22',
    comparison: 'previous_period',
  };

  console.log('\nLive analytics');
  const all = await buildDashboardAnalytics(unrestricted, new URLSearchParams({ ...base, channel: 'all' }));
  const kpi = Object.fromEntries(all.kpis.cards.map((card) => [card.key, card]));

  await testAsync('four branches and all channels are returned', async () => {
    assert.equal(all.branches.rows.length, 4);
    assert.deepEqual(all.branches.rows.map((row) => row.branchName).sort(), [
      'Omshree Fabs -R.R.Nagar', 'Suvarna Fabrics', 'Temple Fabrics - hsr layout', 'Temple Fabrics jayanagar',
    ].sort());
    assert.equal(all.channels.rows.length, 3);
    assert.equal(all.trend.length, 6);
  });

  await testAsync('KPI, branch, category and channel totals reconcile', async () => {
    const revenue = kpi.revenue.value;
    approx(all.branches.totalRevenue, revenue);
    approx(sum(all.categories, (row) => row.revenue), revenue);
    approx(sum(all.channels.rows, (row) => row.revenue), revenue);
    approx(all.reconciliation.check, 0);
    assert.equal(all.branches.totalOrders, kpi.orders.value);
    assert.equal(all.channels.totalOrders, kpi.orders.value);
    assert.equal(all.reconciliation.totalOrders, kpi.orders.value);
  });

  await testAsync('pre-launch POS and website records stay out of dashboard totals', async () => {
    const beforeGoLive = await buildDashboardAnalytics(unrestricted, new URLSearchParams({
      financialYear: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      comparison: 'none',
      channel: 'all',
    }));
    assert.equal(beforeGoLive.kpis.current.revenue, 0);
    assert.equal(beforeGoLive.kpis.current.orders, 0);
    assert.ok(beforeGoLive.kpis.cards.every((card) => card.value === 0));
    assert.equal(beforeGoLive.reconciliation.offline.orders, 0);
    assert.equal(beforeGoLive.reconciliation.website.orders, 0);
    assert.equal(beforeGoLive.reconciliation.website.net, 0);
    assert.ok(beforeGoLive.trend.every((row) => row.revenue === 0 && row.orders === 0));
  });

  await testAsync('dated branches and channel rows have N/A-safe growth', async () => {
    all.branches.rows.forEach((row) => {
      assert.equal(typeof row.revenue, 'number');
      assert.ok(row.share >= 0 && row.share <= 100);
      assert.ok(row.growth === null || Number.isFinite(row.growth));
    });
    all.channels.rows.forEach((row) => {
      assert.ok(row.growth === null || Number.isFinite(row.growth));
    });
  });

  await testAsync('Instagram is attributed from the bill channel, never estimated', async () => {
    const instagram = all.channels.rows.find((row) => row.key === 'instagram');
    assert.equal(instagram.available, true);
    assert.equal(all.reconciliation.instagram.sourceAvailable, true);
    assert.equal(instagram.revenue, all.reconciliation.instagram.net);
    assert.equal(instagram.orders, all.reconciliation.instagram.orders);
    if (instagram.revenue === 0) assert.equal(instagram.orders, 0);
    assert.ok(instagram.growth === null || Number.isFinite(instagram.growth));
    /* the channel split must add back to the total, with nothing double-counted */
    approx(all.channels.totalRevenue, sum(all.channels.rows, (row) => row.revenue));
    approx(all.channels.totalOrders, sum(all.channels.rows, (row) => row.orders));
    approx(all.channels.totalRevenue, kpi.revenue.value);
  });

  await testAsync('every branch maps to an ERP business and no unassigned row exists', async () => {
    const unassigned = all.branches.rows.find((row) => row.branchId === UNASSIGNED_BRANCH);
    assert.equal(unassigned, undefined);
    all.meta.branchScope.forEach((row) => {
      assert.ok(row.businessId);
      assert.ok(row.branchName);
    });
  });

  await testAsync('branch filter narrows every panel to one branch', async () => {
    const data = await buildDashboardAnalytics(unrestricted, new URLSearchParams({
      ...base, channel: 'all', branch: String(suvarna._id),
    }));
    assert.equal(data.meta.branch, String(suvarna._id));
    assert.equal(data.branches.rows.length, 1);
    assert.equal(data.branches.rows[0].branchName, 'Suvarna Fabrics');
    approx(data.kpis.current.revenue, data.branches.rows[0].revenue);
    approx(sum(data.categories, (row) => row.revenue), data.kpis.current.revenue);
    assert.equal(data.meta.branchLabel.includes('Suvarna Fabrics'), true);
  });

  await testAsync('channel filter changes KPIs and categories but keeps reconciliation rows', async () => {
    const website = await buildDashboardAnalytics(unrestricted, new URLSearchParams({
      ...base, channel: 'website',
    }));
    const websiteRow = website.channels.rows.find((row) => row.key === 'website');
    assert.equal(website.channels.rows.length, 3);
    approx(website.kpis.current.revenue, websiteRow.revenue);
    approx(sum(website.categories, (row) => row.revenue), website.kpis.current.revenue);
    assert.ok(website.products.every((row) => row.name === '' || row.name === row.code));
    const returnCard = website.kpis.cards.find((card) => card.key === 'returnRate');
    assert.equal(returnCard.value, null);
    assert.equal(website.forecast.available, website.kpis.current.revenue > 0 && website.meta.days >= 14);
  });

  await testAsync('Instagram scope reports its own tagged bills and reconciles', async () => {
    const instagram = await buildDashboardAnalytics(unrestricted, new URLSearchParams({
      ...base, channel: 'instagram',
    }));
    const row = instagram.channels.rows.find((r) => r.key === 'instagram');
    assert.equal(instagram.channels.rows.length, 3);
    approx(instagram.kpis.current.revenue, row.revenue);
    approx(instagram.kpis.current.orders, row.orders);
    if (row.revenue !== 0) {
      approx(sum(instagram.categories, (c) => c.revenue), row.revenue);
    }
    approx(instagram.reconciliation.check, 0);
    const returnCard = instagram.kpis.cards.find((card) => card.key === 'returnRate');
    assert.ok(returnCard.value === null || Number.isFinite(returnCard.value));
    assert.equal(instagram.forecast.available, instagram.kpis.current.revenue > 0 && instagram.meta.days >= 14);
  });

  await testAsync('forecast is a labelled run-rate model with a bounded range', async () => {
    if (all.kpis.current.revenue === 0) {
      assert.equal(all.forecast.available, false);
      assert.match(all.forecast.reason, /no positive net revenue/i);
    } else {
      assert.equal(all.forecast.available, true);
      assert.match(all.forecast.model, /daily average/i);
      assert.match(all.forecast.disclaimer, /not a guarantee/i);
      approx(all.forecast.forecast, all.forecast.dailyAverage * all.forecast.nextMonthDays);
      assert.ok(all.forecast.lower < all.forecast.forecast);
      assert.ok(all.forecast.upper > all.forecast.forecast);
    }
  });

  await testAsync('recommendations only call positive growth "growing"', async () => {
    all.recommendations.growingDemand.forEach((row) => assert.ok(row.growth > 0));
    all.insights.growingCategories.forEach((row) => {
      assert.ok(row.growth > 0);
      assert.notEqual(row.category, 'Uncategorised / unallocated');
    });
  });

  await testAsync('inventory never adds pieces to metres', async () => {
    const units = (all.inventory.stockByUom || []).map((row) => row.uom);
    assert.equal(new Set(units).size, units.length);
    all.inventory.stockByUom.forEach((row) => {
      assert.ok(typeof row.stock === 'number');
      assert.ok(typeof row.sold28 === 'number');
    });
    assert.equal(all.inventory.stockUnits, undefined);
  });

  await testAsync('range and financial-year validation returns 422', async () => {
    /* A whole Indian financial year is 365 (366 in a leap year) inclusive
       days, which is inside the 366-day cap, so it must load rather than be
       rejected as too long. */
    const fullYear = await buildDashboardAnalytics(unrestricted, new URLSearchParams({
      financialYear: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    assert.equal(fullYear.meta.days, 365);
    assert.ok(Number(fullYear.kpis.current.orders) >= 0);
    await assert.rejects(
      buildDashboardAnalytics(unrestricted, new URLSearchParams({
        financialYear: '2026-2027', startDate: '2026-10-10', endDate: '2026-10-01',
      })),
      (err) => err.status === 422
    );
    await assert.rejects(
      buildDashboardAnalytics(unrestricted, new URLSearchParams({
        financialYear: '2025-2026', startDate: '2026-04-01', endDate: '2026-04-02',
      })),
      (err) => err.status === 422 && err.code === 'OUTSIDE_FINANCIAL_YEAR'
    );
  });

  await testAsync('restricted session cannot read another branch through analytics', async () => {
    await assert.rejects(
      buildDashboardAnalytics(restricted, new URLSearchParams({
        ...base, branch: String(other._id),
      })),
      (err) => err.status === 403
    );
    const scoped = await buildDashboardAnalytics(restricted, new URLSearchParams({ ...base }));
    assert.equal(scoped.branches.rows.length, 1);
    assert.equal(scoped.branches.rows[0].branchId, String(suvarna._id));
  });

  console.log('\nWorkbook');
  await testAsync('the download is built from the same filtered payload', async () => {
    const buffer = XLSX.write(buildDashboardWorkbook(all), { type: 'buffer', bookType: 'xlsx' });
    const book = XLSX.read(buffer, { type: 'buffer' });
    for (const name of ['Summary', 'Revenue Trend', 'Top Products', 'Sales by Region', 'Channel Performance', 'Reconciliation', 'Forecast', 'Insights', 'Inventory', 'Data Quality', 'Definitions']) {
      assert.ok(book.SheetNames.includes(name), `missing sheet ${name}`);
    }
    const regions = XLSX.utils.sheet_to_json(book.Sheets['Sales by Region'], { header: 1 });
    const totalRow = regions.find((row) => row[0] === 'Total');
    approx(totalRow[3], all.branches.totalRevenue);
    const channels = XLSX.utils.sheet_to_json(book.Sheets['Channel Performance'], { header: 1 });
    const channelTotal = channels.find((row) => row[0] === 'Total');
    approx(channelTotal[2], all.channels.totalRevenue);
    assert.match(dashboardFilename(all), /^sales-dashboard_2026-09-23_2026-10-22\.xlsx$/);
  });

  console.log(`\n${passed} checks passed.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nDashboard tests failed:');
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exitCode = 1;
});
