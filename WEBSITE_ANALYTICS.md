# Website Analytics

Website Analytics measures what happens on the storefront: traffic, product
interest, the session funnel, on-site searches and tracked purchases. It is
read separately from ERP sales and is never posted into a ledger.

The ERP remains the system of record for money. A tracked purchase is a
storefront event carrying an order id and a value. It is not added to net sales,
because an order that also reached the ERP would then be counted twice. The
dashboard says this in the Website tracking card and the website screen
repeats it on the revenue tile.

- Screen: `/admin/ecommerce/website-analytics` (under E-commerce)
- Dashboard card: `/admin` -> Website tracking
- Public collection endpoint: `POST /api/website-analytics/collect`
- Private overview and export: `GET /api/website-analytics/overview`,
  `GET /api/website-analytics/export`
- Tracker: `public/we-analytics.js`

## Install the tracker

Serve `we-analytics.js` from the ERP host and load it on every storefront
page. The `data-business` attribute is required in practice: the ERP's
queries are scoped by business, so an event without one will not appear under
a selected business.

```html
<script
  defer
  src="https://erp.example.com/we-analytics.js"
  data-business="<business _id>"
  data-location="<companyLocation _id, optional>"
  data-endpoint="https://erp.example.com/api/website-analytics/collect"
  data-consent="required"></script>
```

- `data-endpoint` is optional when the storefront and ERP share an origin;
  the tag then uses `/api/website-analytics/collect` on its own host.
- `data-location` is optional. Storefront sessions do not always know which
  physical branch they belong to, so a locationless event is admitted when
  the signed-in account is restricted to particular branches, and excluded
  when it carries a different branch's id.
- `data-consent="required"` is the default. `data-consent="implied"` is
  available only where another lawful basis applies; see Consent below.
- `data-site` can override the hostname used to recognise same-site
  navigation. It defaults to `location.hostname`.

The script is a plain classic script, not an ES module, so `defer` works with
`document.currentScript`. It has no dependencies and does not use cookies.

## Consent, Do Not Track and Global Privacy Control

Consent is denied by default. Nothing is sent until one of these is true:

1. `window.weAnalytics.consent('granted')` has been called.
2. `localStorage.we_analytics_consent` is `granted` before the tag loads.
3. The tag was loaded with `data-consent="implied"` and the visitor has not
   denied consent.
4. The server deployment sets `WEBSITE_ANALYTICS_IMPLIED_CONSENT=true` and the
   request carries no consent value.

A consent banner normally calls:

```js
window.weAnalytics.consent('granted'); // accept
window.weAnalytics.consent('denied');  // reject, clears the stored ids
window.weAnalytics.state;              // 'pending' | 'granted' | 'denied' | 'implied'
window.weAnalytics.granted;            // boolean
```

Do Not Track and Global Privacy Control always win:

- `navigator.doNotTrack === '1'`
- `window.doNotTrack === '1'`
- `navigator.msDoNotTrack === '1'`
- `navigator.globalPrivacyControl === true`

When DNT or GPC is on, the tracker sends nothing. The server independently
checks the `DNT` and `Sec-GPC` request headers, so a caller cannot bypass the
rule by omitting the tracker's own flag.

The server also refuses events without consent unless
`WEBSITE_ANALYTICS_IMPLIED_CONSENT=true`. A declined event is acknowledged
with `202` but is not written, so the browser does not retry it.

## What the tracker sends

The tag sends an allow-listed payload and never a form field, cookie or full
URL.

| Type | When | Notable fields |
| --- | --- | --- |
| `pageview` | Load and SPA navigation | `path`, `title`, referrer host |
| `product_view` | Product page | `productId`, `productName` |
| `add_to_cart` | Add to cart | product fields, `value`, `quantity` |
| `checkout_start` | Checkout begins | `value`, `currency` |
| `purchase` | Order confirmation | `orderId`, `value`, `currency`, product fields |
| `search` | On-site search | `searchQuery` |
| `custom` | Named event | `name`, optional metadata |

Programmatic calls:

```js
window.weAnalytics.pageview();
window.weAnalytics.product({ productId, productName, value });
window.weAnalytics.addToCart({ productId, productName, value, quantity });
window.weAnalytics.checkout({ value, currency: 'INR' });
window.weAnalytics.purchase({ orderId, value, currency: 'INR', productId, productName, quantity });
window.weAnalytics.search('silk saree');
window.weAnalytics.track('custom', { name: 'size_guide_open' });
```

A purchase without an `orderId` is not sent. Every other event receives a
random `eventId`; a purchase uses `purchase:<orderId>` as its dedupe key.

Attribution is kept for the session. The landing UTM values or external
referrer host are stored in `sessionStorage` and attached to later events, so
a product view or purchase after an internal navigation is still credited to
the campaign. Same-site navigation is never sent as a referrer, and a visit
with no campaign or external referrer is `Direct`.

The tracker trims its own payload to 12 KB before sending. It uses
`navigator.sendBeacon` where available and falls back to `fetch` with
`keepalive`, `credentials: 'omit'` and a `text/plain` body. Both are simple
CORS requests, so the endpoint must allow the storefront origin.

## Consent-gated storage

The tracker stores four values in the browser, none of them cookies:

- `we_analytics_consent` (`localStorage`): the visitor's choice.
- `we_analytics_visitor` (`localStorage`): a random visitor id.
- `we_analytics_session` and `we_analytics_session_at` (`sessionStorage`): a
  random session id and its last activity time. A session ends after 30
  minutes of inactivity.
- `we_analytics_attribution` (`sessionStorage`): the campaign or external
  referrer that brought this session in. Keeping it for the session means a
  product view or purchase two pages later is still credited to the landing
  campaign instead of falling back to Direct. It is cleared with the session
  and when consent is denied.

Denying consent removes the visitor, session and attribution values. Nothing
is written before consent is granted.

## Privacy at the boundary

`POST /api/website-analytics/collect` is the only public write endpoint in
the project. It is deliberately narrow:

- POST only; JSON or `text/plain`; 16 KB maximum body.
- The request origin must be the ERP's own origin or listed in
  `WEBSITE_ANALYTICS_ALLOWED_ORIGINS`.
- Consent, DNT and GPC are checked before any database connection is opened.
- Known bots and an absent User-Agent are accepted with `202` but not stored.
- The endpoint never reveals whether a particular order id already exists:
  created, skipped and duplicate all answer `202`.

What is stored, and what is not:

| Input | Stored as |
| --- | --- |
| IP address | salted SHA-256 prefix in `ipHash`; never the address |
| User-Agent | parsed `browser`, `os`, `deviceType`; the string is discarded |
| Full referrer URL | `referrerHost` only |
| Page URL | `path` only; query string and fragment removed |
| Metadata | shallow allow-listed primitives; PII-looking keys dropped, values scrubbed |
| Country | two-letter code, if supplied by the platform or tag |

The scrubber redacts email addresses, phone-shaped numbers, card-shaped digit
runs and long token-shaped strings. A page path containing an email address
is stored as `/user/[email]`.

Set `WEBSITE_ANALYTICS_HASH_SALT` per deployment. If it is absent the module
falls back to `AUTH_SECRET` and then to a development salt, which is not
suitable for production.

Rows are eligible for deletion **400 days** after `occurredAt` through a
MongoDB TTL index. TTL deletion is asynchronous: a row becomes eligible at
400 days and is removed by MongoDB's next sweep, not at an exact second.

## Deduplication

Two unique sparse indexes make retries harmless:

- `eventId`: the tracker's random id for one event. A `sendBeacon` retry
  carries the same id and collides with the first write.
- `dedupeKey`: `purchase:<orderId>` when the event has an order id, otherwise
  `event:<eventId>`. Two tabs on the order confirmation page cannot count the
  same sale twice.

A duplicate write returns `202` and is not an error the browser should retry.

## Missing tracking is not zero

The screen and the dashboard card distinguish three states:

1. **Not installed** - no storefront event has ever been accepted for this
   business. Every metric is `null`, and the screen shows the install panel.
2. **Installed, no traffic in the period** - the tag has sent events before,
   but none fall in the selected range. Metrics are `0` and the screen says
   this is a real zero for the period.
3. **Installed, traffic present** - real counts, comparisons and breakdowns.

Do not replace a `null` metric with `0` to make a card look tidier. The two
states need different fixes.

A period is capped at 20,000 stored events per window. If the cap is reached,
`tracking.truncated` is set and the screen and CSV say the figures use the
most recent events. Narrow the period for an exact answer. The comparison
window has its own cap and is reported separately.

## APIs

All private routes require a signed-in session and use the same
business/location/financial-year scope as the rest of the ERP. A location the
account is not assigned to is refused rather than silently widened.

### `GET /api/website-analytics/overview`

Query: `business`, `location`, `finYear`, `preset`, `from`, `to`.

Presets: `today`, `7d`, `30d`, `90d`, `month`, `lastmonth`, `fy`, `custom`.
`custom` requires `from` and `to` as `YYYY-MM-DD`; the range is inclusive and
cannot exceed 366 days. Every boundary is cut in Asia/Kolkata, so a 00:30 IST
visit belongs to that calendar day.

The response contains `tracking`, `kpis`, `daily`, `funnel`, `topPages`,
`sources`, `referrers`, `devices`, `countries`, `products`, `searches`,
`recentPurchases`, `range`, `scope`, `notes` and `generatedAt`.

### `GET /api/website-analytics/export`

The same overview call rendered as CSV, with a UTF-8 BOM for Excel. A null
metric is an empty cell. Cells beginning with `=`, `+`, `-` or `@` are
prefixed with an apostrophe so a page title or search term cannot become a
spreadsheet formula.

### `POST /api/website-analytics/collect`

The public endpoint described above. Responses:

| Status | Meaning |
| --- | --- |
| `202` | Created, skipped by consent/DNT/bot, or duplicate |
| `400` | Malformed JSON |
| `403` | Origin not allowed |
| `413` | Body larger than 16 KB |
| `415` | Content type is not JSON or `text/plain` |
| `422` | Missing session, unknown type, purchase without an order |
| `429` | In-process rate limit exceeded; see `Retry-After` |

`OPTIONS` answers the CORS preflight for an allowed origin.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `WEBSITE_ANALYTICS_ALLOWED_ORIGINS` | Comma-separated storefront origins, e.g. `https://shop.example.com,https://www.shop.example.com` | empty |
| `WEBSITE_ANALYTICS_ALLOW_ANY_ORIGIN` | `true` accepts any origin; development only | false |
| `WEBSITE_ANALYTICS_HASH_SALT` | Salt for the IP hash; set a distinct value in production | `AUTH_SECRET`, then a dev salt |
| `WEBSITE_ANALYTICS_IMPLIED_CONSENT` | `true` accepts events without an explicit consent value; use only with another lawful basis | false |
| `WEBSITE_ANALYTICS_SITE_HOST` | Canonical storefront host used to classify same-site referrers | request `Origin` |
| `WEBSITE_ANALYTICS_INTERNAL_HOSTS` | Comma-separated staff/preview hosts; matching events are flagged internal and excluded | empty |

Origins in `WEBSITE_ANALYTICS_ALLOWED_ORIGINS` must include the scheme and
port and must not end in a slash. A mismatch is the usual cause of a CORS
error in the browser console.

## Rate limiting

The public endpoint allows 180 events per minute per IP hash, in process. This
is abuse protection, not a security boundary: serverless instances do not
share memory, so a distributed caller can still spread requests. It stops one
runaway tracker or a naive script from filling the collection and requires no
extra infrastructure. The key is the salted IP hash, never the IP.

## Indexes and retention

`models/WebsiteEvent.js` declares the indexes:

- `{ businessId, occurredAt: -1 }`
- `{ businessId, type, occurredAt: -1 }`
- `{ sessionId, occurredAt }`
- `{ visitorId, occurredAt }`
- `{ eventId }` unique, sparse
- `{ dedupeKey }` unique, sparse
- `{ occurredAt }` TTL, 400 days

Mongoose creates them on first model use in development. In a deployment
where automatic index creation is disabled, run `syncIndexes()` once during
release. No data migration is required: the collection starts empty and old
rows simply expire. Do not drop or rebuild the collection to deploy this
feature.

## Testing

```bash
npm run test:dashboard
npm run test:website-analytics
npm run build
```

`test:dashboard` exercises the pure range, sales, stock, formatting,
attribution, CSV, summary, validation, privacy and rate-limit rules without a
database. `test:website-analytics` checks the required files, the dashboard
wiring, the navigation entry, the tracker's consent/DNT/purchase guards, the
model's dedupe and TTL indexes, and the null-versus-zero summary behaviour.

The scripts use `scripts/aliasRegister.mjs` so `@/...` imports resolve in
plain Node. They do not open a database connection.

## Troubleshooting

**The screen says "Tracking not installed".**
Check that the script tag loads without a 404, that `window.weAnalytics`
exists, that `data-business` is a real business id, and that the visitor has
granted consent. DNT/GPC or an ad blocker can also suppress every request.

**The browser reports a CORS error.**
Add the exact storefront origin (scheme, host and port) to
`WEBSITE_ANALYTICS_ALLOWED_ORIGINS`. The collect endpoint answers a preflight
only for an allowed origin.

**Events are accepted but purchases do not appear.**
A purchase requires `orderId`. The tracker refuses to send one without it,
and the server rejects it with `422` if it is missing.

**The period is marked truncated.**
More than 20,000 events fall in the window. Narrow the period; the figures
shown are the most recent 20,000, not the whole period.

**A metric shows a dash instead of zero.**
The site has never sent an event for that business, or the metric has no
denominator (for example conversion with no sessions). That is "not tracked"
or "not applicable", not a zero.

**A 429 appears in the console.**
The per-IP, per-process limit was exceeded. This is usually a runaway loop or
a test script; wait for the `Retry-After` interval.

## Limitations

- Tracking is JavaScript-only. A visitor with scripting disabled is invisible.
- Ad blockers, privacy extensions and corporate proxies may block the tag.
- Bot detection is User-Agent based and is not a guarantee.
- The consent flag is asserted by the browser; the server cannot verify a
  visitor's actual choice, only that the caller said consent was granted.
- Rate limiting is per process and is not shared across instances.
- Website revenue is storefront-reported and is not reconciled against ERP
  invoices. It is deliberately excluded from ERP net sales.
- This feature records aggregate behaviour. It is not a substitute for a
  legal review of the deployment's privacy notices and retention policy.

## File map

| Path | Role |
| --- | --- |
| `models/WebsiteEvent.js` | Schema, dedupe indexes, TTL |
| `lib/website-analytics/privacy.js` | IP hash, UA parsing, path/host/metadata scrubbing |
| `lib/website-analytics/validation.js` | Public event boundary, consent/DNT, normalisation |
| `lib/website-analytics/rateLimit.js` | In-process limiter |
| `lib/website-analytics/collect.js` | Ordering: rate limit, validate, write |
| `lib/website-analytics/summarise.js` | Pure traffic, funnel and product arithmetic |
| `lib/website-analytics/service.js` | Event loading, comparison window, truncation |
| `lib/website-analytics/export.js` | CSV export |
| `lib/dashboard/range.js` | IST day/month/FY boundaries and presets |
| `lib/dashboard/calculations.js` | Sales, returns, purchases, stock, payment mix |
| `lib/dashboard/storefront.js` | Channel attribution |
| `lib/dashboard/format.js` | Indian number, money, percent and time formatting |
| `lib/dashboard/export.js` | Formula-safe CSV helpers |
| `lib/dashboard/analytics.js` | Dashboard server aggregates |
| `app/api/website-analytics/collect/route.js` | Public POST/OPTIONS |
| `app/api/website-analytics/overview/route.js` | Private overview |
| `app/api/website-analytics/export/route.js` | Private CSV |
| `app/api/dashboard/analytics/route.js` | Dashboard aggregates |
| `app/api/dashboard/options/route.js` | Period presets and scope |
| `app/api/dashboard/export/route.js` | Dashboard CSV |
| `components/website-analytics/` | Screen, funnel, tables, install panel |
| `components/dashboard/` | Dashboard screen and range picker |
| `components/analytics/` | Shared stat tile and bar list |
| `public/we-analytics.js` | Storefront tracker |
| `scripts/testDashboard.mjs` | Unit tests |
| `scripts/verifyWebsiteAnalytics.mjs` | Wiring and safety checks |
