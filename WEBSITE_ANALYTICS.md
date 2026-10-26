# Website Analytics

The ERP's **E-commerce → Website Analytics** screen (`/admin/ecommerce/website-analytics`)
reports on the storefront at https://wovenessence.in/.

It is additive. It reads storefront collections that already exist in the same
MongoDB database and never writes to an order, cart, customer, item or stock
record. Access uses the existing `reports.view` permission and the existing
session cookie; a branch-restricted session sees only its own branches.

## Where the figures come from

| Panel | Source | Definition |
|---|---|---|
| Sessions, page views, page-type split, trend | `visits` (written by the storefront) | One document per branch / day / page type. `views` and `sessions` are summed. A session ends after 30 minutes without activity, as counted by the storefront. |
| Orders, revenue, AOV, top products | `orders` | Only `confirmed`, `processing`, `packed`, `shipped`, `out_for_delivery`, `delivered`. `cancelled` and `pending_payment` are excluded. Revenue is `amounts.grandTotal`. |
| Registrations, logged-in accounts | `customers` | `createdAt` for registration; `lastLoginAt` for the most recent login. Only the latest login is stored, so login activity is a floor, not an event count. |
| Repeat buyers | `orders` grouped by `customer` | A buyer is repeat when their full order history contains more than one order. |
| Cart abandonment | `carts` | A cart is abandoned when it has at least one line and has not been updated for 24 hours. Carts inside that window are "in progress". |
| Delivery geography | `orders.shippingAddress` → `billingAddress` → `branchCity` | Delivery location, explicitly not visitor IP location. |
| Unique visitors, sources, devices, visitor geography, product views, live activity | `websiteevents` (first-party tracker) | Only shown once the tracker is installed. Until then each of those panels says so instead of estimating. |

## Definitions

- **Visitor** — a random first-party identifier stored in the visitor's browser
  (`localStorage`). One person on two browsers is two visitors. No cookie,
  fingerprint or IP address is stored.
- **Session** — the storefront's own 30-minute inactivity window.
- **Session conversion** — qualifying orders ÷ sessions. This is not
  visitor conversion; visitor conversion needs the tracker.
- **Purchase** — counted in the funnel only when ingestion found the order
  reference in `orders`. An unverified browser claim is stored for diagnosis
  but never counted.
- **Dates** — Asia/Kolkata calendar days, inclusive, up to 366 days per
  selection. Comparisons are previous period, previous month or previous year.

## Storefront installation

The storefront loads one script from this repository's `public/we-analytics.js`.
It must be told where the ERP lives, because `NEXT_PUBLIC_*` values are inlined
at build time:

```
# storefront .env — then rebuild
NEXT_PUBLIC_ANALYTICS_URL=https://wovenessence.etpl.ai
```

With it set, `components/analytics/website-analytics.tsx` renders
`<script src="<origin>/we-analytics.js" data-endpoint="<origin>/api/website-analytics/collect">`
after hydration. With it blank, no tracker is loaded at all, so a local build
cannot pollute the production analytics database.

The script records `page_view` and `session_start` itself, on load and on
client-side navigation, and exposes `window.weTrack` for what only the site
knows. `src/lib/analytics.ts` is the typed wrapper, `TrackEvent` fires a single
mount-time event from a server page.

| Event | Fired from |
|---|---|
| `page_view`, `session_start` | `we-analytics.js` itself |
| `product_view` | `/products/[slug]`, and the ERP catalogue detail view `/collections/[slug]?barcode=…` |
| `search` | `/search` when a query is present |
| `add_to_cart` | product page, product card quick-add, ERP catalogue quick-add — on a successful cart write |
| `view_cart` | `/cart` once the bag is loaded and not empty |
| `begin_checkout` | `/checkout` once the bag is loaded |
| `add_payment_info` | the checkout submit, before the order is placed |
| `login_success`, `sign_up_success` | successful `/login` and `/register` submissions |
| `purchase` | `/checkout/success/[orderNo]`, with the order number |

`purchase` passes the storefront order number. The collector looks the order up
in `orders`, marks the event verified and takes the value from the order itself —
the browser cannot invent revenue. Storefront orders use `orderNo`/`netAmount`
and live in the storefront database; ERP sales orders use
`orderNumber`/`amounts.grandTotal`. The collector accepts either shape and, when
`STOREFRONT_DB_NAME` (default `woven_essence_web`) differs from its own database
on the same cluster, looks there too.

Accepted events: `page_view`, `session_start`, `product_list_view`,
`product_view`, `search`, `login_success`, `sign_up_success`, `add_to_cart`,
`remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`,
`add_payment_info`, `purchase`, `refund`, `logout`.

### Collector endpoint

`POST /api/website-analytics/collect` — public by design (a storefront browser
has no ERP session) and protected by:

- a fixed event vocabulary and length-clamped fields
- an 8 KB body limit, an in-memory per-IP rate limit and crawler filtering
- a unique dedupe key, so a retried beacon is a no-op
- path stored without its query string, so reset tokens never reach the database
- CORS limited to `WEBSITE_ANALYTICS_ORIGINS`

Set the allowed origins in the ERP environment (comma-separated, defaults cover
`wovenessence.in`, `www.wovenessence.in` and `wovenessence.etpl.ai`). The
storefront's own origin must be in this list, or the browser blocks the beacon:

```
WEBSITE_ANALYTICS_ORIGINS=https://wovenessence.in,https://www.wovenessence.in,https://wovenessence.etpl.ai
```

The collector answers with the exact origin plus
`Access-Control-Allow-Credentials: true`. `navigator.sendBeacon` always sends
in credentials mode, so without that header the browser's preflight fails and
the beacon never leaves the page.

## Privacy

- No cookies. The visitor identifier is random and lives in `localStorage`.
- The query string is stripped before storage; no passwords, tokens, card data,
  names, emails, phones or IP addresses are stored.
- `localStorage.we_analytics_optout = '1'` or Global Privacy Control silences
  the tracker completely; a `consent: 'denied'` event is discarded.
- Raw events have no retention policy applied automatically. Decide one and
  remove rows from `websiteevents` accordingly.

## Verifying

```bash
npm run test:website-analytics
```

Read-only. Reports total and recent events, per-event counts, unique visitors,
sessions, verified versus unmatched purchases, missing required events and how
fresh the `visits` counter is.

Then open the dashboard signed in and check:

1. The header says **Visitor tracker live** and the KPI card shows a number
   instead of "Not tracked".
2. Traffic sources, devices and live activity have rows.
3. The funnel switches from "page views" to "unique visitors".
4. A test `purchase` appears as verified only when its order exists.

## Known limitations

- This storefront writes tracker events but not the `visits` counter, so on a
  fresh install the **Sessions** and **Page views by section** panels still
  read the older counter and stay empty until something writes it. Unique
  visitors, sources, devices, product views, the visitor funnel and live
  activity come from `websiteevents` and go live as soon as the tag is on.
- `visits` has no visitor identifier, so page-view and session figures can
  never be turned into unique people. That is what `websiteevents` is for.
- Account logins are counted from `lastLoginAt`, which keeps only the latest
  login per account.
- `carts` carries no add-to-cart timestamps, so cart abandonment uses the
  documented 24-hour inactivity rule rather than a per-event reconstruction.
- Visitor geography requires country/city to be supplied by the storefront's
  edge. Delivery geography on this screen comes from order addresses instead.
