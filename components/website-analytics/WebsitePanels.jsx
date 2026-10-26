'use client';

import { formatCurrency, formatNumber, formatPercent, relativeTime } from '@/lib/dashboard/format';

/* The tables and the setup card used by Website Analytics.

   Kept out of the client shell so the fetch/range logic there stays readable;
   every component here is presentational. */

export function TopPagesPanel({ rows = [] }) {
  if (!rows.length) return <p className="dash-empty">No page view was tracked in this period.</p>;

  return (
    <div className="dash-table-wrap">
      <table className="dt">
        <thead>
          <tr>
            <th>Page</th>
            <th className="text-right">Views</th>
            <th className="text-right">Visitors</th>
            <th className="text-right">Sessions</th>
            <th className="text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((page) => (
            <tr key={page.path}>
              <td className="wa-path" title={page.path}>{page.path}</td>
              <td className="text-right">{formatNumber(page.views)}</td>
              <td className="text-right">{formatNumber(page.visitors)}</td>
              <td className="text-right">{formatNumber(page.sessions)}</td>
              <td className="text-right">{formatPercent(page.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductsPanel({ rows = [] }) {
  if (!rows.length) return <p className="dash-empty">No product event was tracked in this period.</p>;

  return (
    <div className="dash-table-wrap">
      <table className="dt">
        <thead>
          <tr>
            <th>Product</th>
            <th className="text-right">Views</th>
            <th className="text-right">Add to cart</th>
            <th className="text-right">Purchases</th>
            <th className="text-right">Revenue</th>
            <th className="text-right">View &rarr; buy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((product) => (
            <tr key={product.productId || product.name}>
              <td title={product.name}>{product.name}</td>
              <td className="text-right">{formatNumber(product.views)}</td>
              <td className="text-right">{formatNumber(product.addToCart)}</td>
              <td className="text-right">{formatNumber(product.purchases)}</td>
              <td className="text-right">{formatCurrency(product.revenue)}</td>
              <td className="text-right">{formatPercent(product.conversionRate, { decimals: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentPurchasesPanel({ rows = [] }) {
  if (!rows.length) return <p className="dash-empty">No tracked purchase in this period.</p>;

  return (
    <div className="dash-table-wrap">
      <table className="dt">
        <thead>
          <tr>
            <th>When</th>
            <th>Order</th>
            <th>Product</th>
            <th>Channel</th>
            <th className="text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((purchase, index) => (
            <tr key={purchase.orderId || purchase.occurredAt + index}>
              <td className="whitespace-nowrap" title={purchase.occurredAt}>
                {relativeTime(purchase.occurredAt)}
              </td>
              <td className="whitespace-nowrap">{purchase.orderId || '-'}</td>
              <td>{purchase.productName || '-'}</td>
              <td><span className="pill pill-blue">{purchase.channel || 'Direct'}</span></td>
              <td className="text-right whitespace-nowrap">
                {formatCurrency(purchase.value)}
                {purchase.currency && purchase.currency !== 'INR' ? ` ${purchase.currency}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchesPanel({ rows = [] }) {
  if (!rows.length) return <p className="dash-empty">No on-site search was tracked in this period.</p>;

  return (
    <ul className="wa-searches">
      {rows.map((row) => (
        <li key={row.term}>
          <span title={row.term}>{row.term}</span>
          <b>{formatNumber(row.count)}</b>
        </li>
      ))}
    </ul>
  );
}

export function InstallPanel({ businessId = '', endpoint = '' }) {
  const resolvedEndpoint = endpoint || 'https://your-erp.example.com/api/website-analytics/collect';
  const snippet = [
    '<script defer src="https://your-erp.example.com/we-analytics.js"',
    `        data-business="${businessId || '<business _id>'}"`,
    '        data-location="<companyLocation _id, optional>"',
    `        data-endpoint="${resolvedEndpoint}"></script>`,
  ].join('\n');

  return (
    <div className="card wa-install">
      <div className="card-head">
        <span className="card-title">Connect the storefront</span>
        <span className="card-sub">one script tag</span>
      </div>
      <div className="card-body">
        <p className="dash-note-line">
          No website event has been received for this business yet. The comparison above reports
          <strong> not tracked</strong> rather than zero - those are different answers.
        </p>
        <pre className="wa-code">{snippet}</pre>
        <p className="dash-note-line">
          Consent is denied by default. The tag waits for
          <code> window.weAnalytics.consent(&apos;granted&apos;)</code> or a stored
          <code> we_analytics_consent=granted</code>; Do Not Track always blocks collection.
          Cross-origin storefronts must list their origin in
          <code> WEBSITE_ANALYTICS_ALLOWED_ORIGINS</code>.
        </p>
        <p className="dash-note-line">
          Events are deduplicated by the tracker event id and by <code>purchase:&lt;orderId&gt;</code>,
          IP addresses are salted-hashed, User-Agents are parsed and discarded, and rows expire
          after 400 days. Details are in <code>WEBSITE_ANALYTICS.md</code>.
        </p>
      </div>
    </div>
  );
}
