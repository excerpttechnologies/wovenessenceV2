/* CSV export for website analytics.

   Shares csvCell/rowsToCsv with the dashboard so a page title beginning
   with "=" cannot become a formula in either file. */

import { rowsToCsv } from '@/lib/dashboard/export';

const num = (value, decimals = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : '';
};

export function buildWebsiteAnalyticsCsv(snapshot) {
  const rows = [];
  const range = snapshot?.range || {};
  const tracking = snapshot?.tracking || {};
  const kpis = snapshot?.kpis || {};

  rows.push(['Woven Essence - Website Analytics']);
  rows.push(['Generated', snapshot?.generatedAt || '']);
  rows.push(['Period', range.label || '']);
  rows.push(['From', range.fromKey || '']);
  rows.push(['To', range.toKey || '']);
  rows.push([]);

  rows.push(['Tracking']);
  rows.push(['Installed', tracking.installed ? 'Yes' : 'No']);
  rows.push(['First event', tracking.firstEventAt || '']);
  rows.push(['Last event', tracking.lastEventAt || '']);
  rows.push(['Data in this period', tracking.hasDataInRange ? 'Yes' : 'No']);
  rows.push(['Truncated', tracking.truncated ? 'Yes' : 'No']);
  rows.push([]);

  /* A null metric means "not tracked", not zero. The empty cell says so
     without pretending the site had no visitors. */
  rows.push(['Key metrics']);
  rows.push(['Metric', 'Current', 'Previous', 'Change']);
  [
    ['Visitors', kpis.visitors, 0],
    ['Sessions', kpis.sessions, 0],
    ['Page views', kpis.pageviews, 0],
    ['Purchases', kpis.purchases, 0],
    ['Revenue', kpis.revenue, 2],
    ['Conversion rate %', kpis.conversionRate, 2],
    ['Bounce rate %', kpis.bounceRate, 2],
    ['Average session (seconds)', kpis.avgSession, 1],
  ].forEach(([label, metric, decimals]) => {
    rows.push([
      label,
      metric?.value === null || metric?.value === undefined ? '' : num(metric.value, decimals),
      metric?.previous === null || metric?.previous === undefined ? '' : num(metric.previous, decimals),
      metric?.change === null || metric?.change === undefined ? '' : num(metric.change, 2),
    ]);
  });
  rows.push([]);

  rows.push(['Daily traffic']);
  rows.push(['Date', 'Page views', 'Sessions']);
  const daily = snapshot?.daily || {};
  (daily.labels || []).forEach((label, i) => {
    rows.push([label, num(daily.pageviews?.[i]), num(daily.sessions?.[i])]);
  });
  rows.push([]);

  rows.push(['Conversion funnel']);
  rows.push(['Step', 'Sessions', 'Rate %']);
  (snapshot?.funnel?.steps || []).forEach((step) => {
    rows.push([
      step.label,
      step.value === null || step.value === undefined ? '' : num(step.value),
      step.rate === null || step.rate === undefined ? '' : num(step.rate, 2),
    ]);
  });
  rows.push([]);

  rows.push(['Traffic sources']);
  rows.push(['Channel', 'Sessions', 'Page views', 'Purchases', 'Revenue', 'Share %']);
  (snapshot?.sources || []).forEach((source) => {
    rows.push([
      source.label,
      num(source.sessions),
      num(source.pageviews),
      num(source.purchases),
      num(source.revenue, 2),
      num(source.share, 2),
    ]);
  });
  rows.push([]);

  rows.push(['Top pages']);
  rows.push(['Path', 'Views', 'Visitors', 'Sessions', 'Share %']);
  (snapshot?.topPages || []).forEach((page) => {
    rows.push([
      page.path,
      num(page.views),
      num(page.visitors),
      num(page.sessions),
      num(page.share, 2),
    ]);
  });
  rows.push([]);

  rows.push(['Products']);
  rows.push(['Product', 'Product ID', 'Views', 'Add to cart', 'Purchases', 'Revenue', 'Conversion %']);
  (snapshot?.products || []).forEach((product) => {
    rows.push([
      product.name,
      product.productId,
      num(product.views),
      num(product.addToCart),
      num(product.purchases),
      num(product.revenue, 2),
      product.conversionRate === null ? '' : num(product.conversionRate, 2),
    ]);
  });
  rows.push([]);

  rows.push(['Referrers']);
  rows.push(['Host', 'Sessions', 'Page views']);
  (snapshot?.referrers || []).forEach((referrer) => {
    rows.push([referrer.host, num(referrer.sessions), num(referrer.pageviews)]);
  });
  rows.push([]);

  rows.push(['Devices']);
  rows.push(['Device', 'Sessions', 'Share %']);
  (snapshot?.devices || []).forEach((device) => {
    rows.push([device.label, num(device.sessions), num(device.share, 2)]);
  });
  rows.push([]);

  rows.push(['Countries']);
  rows.push(['Country', 'Sessions', 'Share %']);
  (snapshot?.countries || []).forEach((country) => {
    rows.push([country.label, num(country.sessions), num(country.share, 2)]);
  });
  rows.push([]);

  rows.push(['Searches']);
  rows.push(['Term', 'Count']);
  (snapshot?.searches || []).forEach((search) => {
    rows.push([search.term, num(search.count)]);
  });
  rows.push([]);

  rows.push(['Recent tracked purchases']);
  rows.push(['When', 'Order', 'Product', 'Channel', 'Value', 'Currency']);
  (snapshot?.recentPurchases || []).forEach((purchase) => {
    rows.push([
      purchase.occurredAt,
      purchase.orderId,
      purchase.productName,
      purchase.channel,
      num(purchase.value, 2),
      purchase.currency,
    ]);
  });

  return rowsToCsv(rows);
}
