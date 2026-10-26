/* Server-side website analytics.

   Loads the events once, then hands them to the pure summary in
   summarise.js. The route does no arithmetic of its own, which is what lets
   the tests exercise the same rules without a database.

   A large period is capped at EVENT_LIMIT rows. When the cap bites,
   tracking.truncated is set and the screen says so - silently reporting a
   partial period as if it were the whole one is the failure mode this is
   written to avoid. */

import WebsiteEvent from '@/models/WebsiteEvent';
import { websiteEventFilter, scopeDescription } from '@/lib/dashboard/access';
import { summariseWebsiteEvents } from './summarise';

export const EVENT_LIMIT = 20000;

const FIELDS = [
  'type', 'path', 'title', 'referrerHost', 'source', 'medium', 'channel',
  'campaign', 'sessionId', 'visitorId', 'deviceType', 'country',
  'productId', 'productName', 'orderId', 'value', 'currency',
  'searchQuery', 'occurredAt',
].join(' ');

function baseFilter(scope) {
  return {
    ...websiteEventFilter(scope),
    isBot: { $ne: true },
    isInternal: { $ne: true },
  };
}

function inRange(filter, range) {
  return { ...filter, occurredAt: { $gte: range.from, $lte: range.to } };
}

async function loadWindow(filter, range) {
  const scoped = inRange(filter, range);
  const [count, rows] = await Promise.all([
    WebsiteEvent.countDocuments(scoped),
    WebsiteEvent.find(scoped)
      .select(FIELDS)
      .sort({ occurredAt: -1 })
      .limit(EVENT_LIMIT)
      .lean(),
  ]);
  return { rows, count, truncated: count > rows.length };
}

function previousOf(summary) {
  const k = summary?.kpis || {};
  return {
    visitors: k.visitors?.value ?? 0,
    sessions: k.sessions?.value ?? 0,
    pageviews: k.pageviews?.value ?? 0,
    purchases: k.purchases?.value ?? 0,
    revenue: k.revenue?.value ?? 0,
    bounceRate: k.bounceRate?.value ?? null,
    avgSession: k.avgSession?.value ?? null,
  };
}

export async function getWebsiteAnalytics(scope, range) {
  const filter = baseFilter(scope);

  const [latest, first] = await Promise.all([
    WebsiteEvent.findOne(filter).sort({ occurredAt: -1 }).select('occurredAt').lean(),
    WebsiteEvent.findOne(filter).sort({ occurredAt: 1 }).select('occurredAt').lean(),
  ]);

  const installed = Boolean(latest);
  const trackingBase = {
    installed,
    firstEventAt: first?.occurredAt ? new Date(first.occurredAt).toISOString() : null,
    lastEventAt: latest?.occurredAt ? new Date(latest.occurredAt).toISOString() : null,
  };

  const rangeInfo = {
    preset: range.preset,
    label: range.label,
    fromKey: range.fromKey,
    toKey: range.toKey,
    days: range.days,
    previousLabel: range.previousLabel,
    previousFromKey: range.previousFromKey,
    previousToKey: range.previousToKey,
    timezone: range.timezone,
  };

  if (!installed) {
    const blank = summariseWebsiteEvents({ tracking: trackingBase, range });
    return {
      ...blank,
      generatedAt: new Date().toISOString(),
      range: rangeInfo,
      scope: scopeDescription(scope),
      currency: 'INR',
      notes: [
        'No storefront event has ever been received for this business, so website figures are not tracked rather than zero.',
        'Add public/we-analytics.js to the storefront and set its data-business attribute to start collecting.',
      ],
    };
  }

  const [currentWindow, previousWindow] = await Promise.all([
    loadWindow(filter, range),
    loadWindow(filter, { from: range.previousFrom, to: range.previousTo }),
  ]);

  const previousSummary = summariseWebsiteEvents({
    events: previousWindow.rows,
    tracking: { installed: true },
    range: { ...range, from: range.previousFrom, to: range.previousTo },
  });

  const current = summariseWebsiteEvents({
    events: currentWindow.rows,
    previous: previousOf(previousSummary),
    tracking: {
      ...trackingBase,
      truncated: currentWindow.truncated || previousWindow.truncated,
    },
    range,
  });

  const notes = [];
  if (!current.hasDataInRange) {
    notes.push('Tracking is installed, but no event was recorded in this period - this is a real zero for the period, not a missing integration.');
  }
  if (currentWindow.truncated) {
    notes.push(`This period has more than ${EVENT_LIMIT.toLocaleString('en-IN')} events; the figures use the most recent ${EVENT_LIMIT.toLocaleString('en-IN')}. Narrow the period for an exact answer.`);
  }
  if (previousWindow.truncated) {
    notes.push('The comparison period was also capped; its change figures are approximate.');
  }
  if (!scope.businessId) {
    notes.push('No business was selected, so events across every business are included.');
  }

  return {
    ...current,
    tracking: {
      ...current.tracking,
      totalEvents: currentWindow.count,
      previousEvents: previousWindow.count,
      sampleLimit: EVENT_LIMIT,
    },
    generatedAt: new Date().toISOString(),
    range: rangeInfo,
    scope: scopeDescription(scope),
    currency: 'INR',
    notes,
  };
}
