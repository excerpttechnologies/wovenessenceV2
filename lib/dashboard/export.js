/* CSV export for the dashboard.

   Spreadsheet applications execute a cell beginning with =, +, - or @ as a
   formula. Every cell goes through csvCell, which quotes/escapes properly and
   neutralises that leading character. A customer name must never become a
   formula just because it starts with a minus sign. */

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  /* Leading whitespace does not stop a spreadsheet treating =1+1 as a
     formula, so inspect the first non-space character. A plain negative
     number ("-16.67") is not a formula and must stay a number; a name that
     merely starts with a minus ("-Customer") is neutralised. */
  const trimmed = text.trimStart();
  const first = trimmed[0];
  const plainNumber = /^-?\d+(?:\.\d+)?$/.test(trimmed);
  const formulaStart = first === '=' || first === '+' || first === '@'
    || first === '\t' || first === '\r'
    || (first === '-' && !plainNumber);
  if (formulaStart) {
    text = "'" + text;
  }
  if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const money = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '');

export function buildDashboardCsv(snapshot) {
  const rows = [];
  const range = snapshot?.range || {};
  const kpis = snapshot?.kpis || {};

  rows.push(['Woven Essence - Dashboard']);
  rows.push(['Generated', snapshot?.generatedAt || '']);
  rows.push(['Period', range.label || '']);
  rows.push(['From', range.fromKey || '']);
  rows.push(['To', range.toKey || '']);
  rows.push(['Comparison', range.previousLabel || '']);
  rows.push([]);

  rows.push(['Key metrics']);
  rows.push(['Metric', 'Current', 'Previous', 'Change %']);
  [
    ['Net sales', kpis.netSales],
    ['Gross sales', kpis.grossSales],
    ['Returns', kpis.returns],
    ['Orders', kpis.orders],
    ['Average order value', kpis.averageOrderValue],
    ['Customers', kpis.customers],
    ['Units sold', kpis.units],
  ].forEach(([label, metric]) => {
    rows.push([
      label,
      money(metric?.value),
      money(metric?.previous),
      metric?.change === null || metric?.change === undefined ? '' : money(metric.change),
    ]);
  });
  rows.push(['Inventory value at cost', money(kpis.inventoryValue?.value), '', '']);
  rows.push(['Inventory units', money(kpis.inventoryValue?.units), '', '']);
  rows.push([]);

  rows.push(['Sales trend']);
  rows.push(['Date', 'Sales', 'Returns']);
  const labels = snapshot?.salesTrend?.labels || [];
  const sales = snapshot?.salesTrend?.series?.[0]?.points || [];
  const returns = snapshot?.salesTrend?.series?.[1]?.points || [];
  labels.forEach((label, i) => rows.push([label, money(sales[i]), money(returns[i])]));
  rows.push([]);

  rows.push(['Purchases']);
  rows.push(['Date', 'Purchases']);
  const purchasePoints = snapshot?.purchaseTrend?.series?.[0]?.points
    || snapshot?.purchaseTrend?.points
    || [];
  (snapshot?.purchaseTrend?.labels || []).forEach((label, i) => {
    rows.push([label, money(purchasePoints[i])]);
  });
  rows.push([]);

  rows.push(['Sales channels']);
  rows.push(['Channel', 'Sales', 'Returns', 'Net', 'Orders', 'Share %']);
  (snapshot?.channels || []).forEach((channel) => {
    rows.push([
      channel.label,
      money(channel.sales),
      money(channel.returns),
      money(channel.net),
      channel.orders,
      money(channel.share),
    ]);
  });
  rows.push([]);

  rows.push(['Payment mix']);
  rows.push(['Method', 'Collected', 'Share %']);
  (snapshot?.payments || []).forEach((payment) => {
    rows.push([payment.label, money(payment.value), money(payment.share)]);
  });
  rows.push([]);

  rows.push(['Top products']);
  rows.push(['Product', 'Code', 'Quantity', 'Revenue']);
  (snapshot?.topProducts || []).forEach((product) => {
    rows.push([product.name, product.code, money(product.qty), money(product.revenue)]);
  });
  rows.push([]);

  rows.push(['Stock alerts']);
  rows.push(['Product', 'Code', 'Quantity', 'Stock value']);
  (snapshot?.inventory?.lowStock || []).forEach((item) => {
    rows.push([item.name, item.code, money(item.qty), money(item.value)]);
  });
  (snapshot?.inventory?.outOfStock || []).forEach((item) => {
    rows.push([item.name, item.code, money(item.qty), money(item.value)]);
  });
  rows.push([]);

  rows.push(['Recent activity']);
  rows.push(['When', 'Type', 'Document', 'Party', 'Amount', 'Status']);
  (snapshot?.recent || []).forEach((row) => {
    rows.push([row.date, row.type, row.no, row.party, money(row.amount), row.status]);
  });
  rows.push([]);

  rows.push(['Website (tracked)']);
  rows.push(['Metric', 'Value']);
  rows.push(['Tracking installed', snapshot?.website?.installed ? 'Yes' : 'No']);
  rows.push(['Events in period', snapshot?.website?.events ?? '']);
  rows.push(['Tracked purchases', snapshot?.website?.purchases ?? '']);
  rows.push(['Tracked revenue', snapshot?.website?.revenue === null ? '' : money(snapshot?.website?.revenue)]);

  return rowsToCsv(rows);
}
