# GA4 Integration Guide — Woven Essence ERP

This document explains how to connect the **Website Analytics** dashboard
(`/admin/ecommerce/website-analytics`) to Google Analytics 4 so it shows
live visitor data from the storefront at `https://ecom.wovenessence.in/`.

---

## Quick-start checklist

| # | Task | Who |
|---|---|---|
| 1 | Create (or locate) a GA4 property for `ecom.wovenessence.in` | Admin |
| 2 | Note the GA4 Property ID and Measurement ID | Admin |
| 3 | Enable the Google Analytics Data API in Google Cloud | Admin |
| 4 | Create a service-account and download its JSON key | Admin |
| 5 | Grant the service-account Viewer access on the GA4 property | Admin |
| 6 | Add four environment variables to the ERP `.env` | Admin / DevOps |
| 7 | Restart the ERP server | DevOps |
| 8 | Verify the connection at `/api/website-analytics/health` | Admin |
| 9 | Install `we-analytics.js` on the storefront | Storefront dev |
| 10 | Verify live events in the dashboard | Admin |

---

## Step 1 — Create or verify the GA4 property

1. Open [Google Analytics](https://analytics.google.com) and sign in with
   the business Google account.
2. Click **Admin** (cog icon, bottom-left).
3. Check whether a property named "Woven Essence" (or similar) already exists
   for `ecom.wovenessence.in` in the **Property** column.
   - If one exists, select it and skip to Step 2.
   - If none exists, click **Create Property**.

**Create Property settings:**
- Property name: `Woven Essence E-commerce`
- Reporting time zone: `India (Kolkata)` — **IST (UTC+5:30)**
- Currency: `Indian Rupee (INR)`
- Click **Next**, fill in business information, click **Create**.

**Add a web data stream:**
- After the property is created, choose **Web**.
- Website URL: `https://ecom.wovenessence.in`
- Stream name: `Woven Essence Storefront`
- Enhanced measurement: **On** (keeps all defaults)
- Click **Create stream**.

---

## Step 2 — Copy Property ID and Measurement ID

**Property ID** (you will set this as `GA4_PROPERTY_ID`):
- Admin → Property → **Property Settings**
- It is a plain number, e.g. `123456789`

**Measurement ID** (you will set this as `GA4_MEASUREMENT_ID`):
- Admin → Data Streams → click your web stream
- Displayed as `G-XXXXXXXXXX`

Keep both values ready. Do not share them publicly.

---

## Step 3 — Enable the Google Analytics Data API

The ERP calls the GA4 Data API from the server. The API must be enabled in
a Google Cloud project.

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project (e.g. `woven-essence-analytics`) or select an
   existing one.
3. In the search bar type **"Google Analytics Data API"** and click the result.
4. Click **Enable**.

---

## Step 4 — Create a service account and download its JSON key

A service account is a non-human Google identity the ERP uses to authenticate
with the GA4 Data API from the server without requiring a user login.

1. GCP Console → **IAM & Admin → Service Accounts → + Create Service Account**.
2. Name: `woven-essence-analytics-reader`
3. Description: `Read-only access to GA4 Data API for Woven Essence ERP`
4. Click **Create and Continue**.
5. Skip "Grant this service account access to project" (no project role needed).
6. Click **Done**.
7. Click the new service account in the list.
8. Go to the **Keys** tab → **Add Key → Create new key → JSON → Create**.
9. A `.json` file is downloaded. **Store it securely — it is a credential.**

The file looks like:
```json
{
  "type": "service_account",
  "project_id": "woven-essence-analytics",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
  "client_email": "woven-essence-analytics-reader@woven-essence-analytics.iam.gserviceaccount.com",
  "client_id": "12345678901234567890",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

Copy the value of `client_email` — you will need it in Step 5.

---

## Step 5 — Grant the service account Viewer access on the GA4 property

The service account needs permission to read your GA4 data.

1. Back in [Google Analytics](https://analytics.google.com).
2. Admin → Property → **Property access management** (under the Property column).
3. Click the **+** button → **Add users**.
4. Email address: paste the `client_email` from the JSON key file.
5. Role: **Viewer**.
6. Uncheck "Notify new users by email" (it is a robot, not a person).
7. Click **Add**.

---

## Step 6 — Add environment variables to the ERP

Open the ERP server's environment file (`.env` or your deployment's secrets
manager). **Do not commit credentials to Git.**

### Required variables

```env
# ── GA4 property identification ──────────────────────────────────────────────
GA4_PROPERTY_ID=123456789
# The numeric property ID from Admin → Property Settings.
# Do NOT include "properties/" — just the number.

GA4_MEASUREMENT_ID=G-XXXXXXXXXX
# The G-XXXXXXXXXX ID from Admin → Data Streams → your web stream.
# Served to the storefront so it can load the GA4 tag.

# ── GA4 Data API authentication ──────────────────────────────────────────────
# Option A (recommended for most deployments) — full JSON in one variable:
GA4_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\nMII...\n-----END RSA PRIVATE KEY-----\n","client_email":"woven-essence-analytics-reader@....iam.gserviceaccount.com",...}
# Paste the entire contents of the JSON key file as a single line.
# Replace every literal newline in the private_key with \n.
# Wrap the whole thing in double quotes.

# Option B — split credentials (useful when your secrets manager has size limits):
# GA4_CLIENT_EMAIL=woven-essence-analytics-reader@....iam.gserviceaccount.com
# GA4_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMII...\n-----END RSA PRIVATE KEY-----\n
# (Use Option A OR Option B, not both.)
```

### Optional variables (sensible defaults apply)

```env
# The public URL of the storefront. Default: https://ecom.wovenessence.in/
GA4_WEBSITE_URL=https://ecom.wovenessence.in/

# Reporting time zone sent with GA4 API requests. Default: Asia/Kolkata
GA4_TIMEZONE=Asia/Kolkata

# Default reporting currency. Default: INR
GA4_CURRENCY=INR

# Set to false to disable all GA4 API calls (e.g. during local development).
# GA4_TRACKING_ENABLED=false

# How long standard GA4 reports are cached in seconds. Default: 300
GA4_CACHE_TTL_SECONDS=300

# How long realtime data is cached in seconds. Default: 60
GA4_REALTIME_CACHE_TTL_SECONDS=60

# Maximum age of stale cached data shown when GA4 is unreachable. Default: 86400
GA4_STALE_MAX_SECONDS=86400

# Storefront MongoDB database name (if it differs from the ERP's database).
# Default: woven_essence_web
STOREFRONT_DB_NAME=woven_essence_web

# Allowed CORS origins for the /api/website-analytics/collect endpoint.
# Default covers ecom.wovenessence.in, wovenessence.in, wovenessence.etpl.ai
# WEBSITE_ANALYTICS_ORIGINS=https://ecom.wovenessence.in,https://wovenessence.in
```

### Preparing GA4_CREDENTIALS_JSON

The JSON key file contains newline characters inside `private_key`. On most
systems the easiest approach is:

**PowerShell (Windows):**
```powershell
$raw = Get-Content -Raw "path\to\service-account-key.json"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
Write-Output $encoded
```
Then set:
```env
GA4_CREDENTIALS_JSON=<the base64 string output above>
```
The ERP's GA4 client auto-detects base64-encoded credentials and decodes them.

---

## Step 7 — Restart the ERP server

Environment variables are read at process startup. After editing `.env`:

```powershell
# If running locally:
# Stop the dev server (Ctrl+C) then:
npm run dev

# If deployed, trigger a redeploy or restart via your host's control panel.
```

---

## Step 8 — Verify the connection

Open this URL in a browser while signed in to the ERP as an owner or admin:

```
http://localhost:3000/api/website-analytics/health
```

A successful response looks like:
```json
{
  "health": {
    "configured": true,
    "status": "connected",
    "propertyId": "123456789",
    "measurementId": "G-XXXXXXXXXX",
    "dataRange": { "from": "2025-01-01", "to": "2025-01-31" },
    "latencyMs": 412
  }
}
```

Common errors and fixes:

| Error in response | Cause | Fix |
|---|---|---|
| `"configured": false` | One or more env vars is missing | Check `GA4_PROPERTY_ID`, `GA4_MEASUREMENT_ID`, `GA4_CREDENTIALS_JSON` |
| `PERMISSION_DENIED` | Service account not added to GA4 property | Repeat Step 5 |
| `NOT_FOUND` | Property ID is wrong | Verify the number in GA4 Admin → Property Settings |
| `UNAUTHENTICATED` | Private key in credentials JSON is invalid | Re-download the JSON key file and redo Step 6 |
| `RESOURCE_EXHAUSTED` | GA4 API quota exceeded | Wait an hour; increase `GA4_CACHE_TTL_SECONDS` |

Once `"status": "connected"` is returned, the dashboard at
`/admin/ecommerce/website-analytics` will display real visitor data.

---

## Step 9 — Install the tracker on the storefront

The ERP provides a first-party tracker script at `/we-analytics.js`. When
loaded on the storefront it:
- Fires `page_view` and `session_start` automatically on every page.
- Exposes `window.weTrack(event, data)` for e-commerce events.
- Installs the GA4 tag by fetching the Measurement ID from
  `/api/website-analytics/config` (no hard-coding required).
- Respects opt-outs and does not run on `localhost` by default.

See `WEBSITE_ANALYTICS.md` for the complete storefront installation
instructions, including the full list of events and the `we-analytics.js`
script tag.

---

## Step 10 — Verify live data in the dashboard

After the storefront tracker is installed and at least a few minutes have
passed:

1. Open `/admin/ecommerce/website-analytics`.
2. The header should show **Visitor tracker live** (green pill) once events
   reach the collector.
3. GA4-sourced KPI cards (Unique Visitors, Active Users, Sessions, New Users,
   Returning Visitors, Page Views) should show numbers rather than
   "GA4 setup required".
4. Change the date range to **Last 7 days** — all cards should update.
5. Open GA4 → **Reports → Realtime** and simultaneously refresh the
   **Currently Active** card on the dashboard — numbers should be in
   the same ballpark (exact match is not expected; attribution models and
   reporting windows differ).

---

## Security rules

- **Never commit** `GA4_CREDENTIALS_JSON`, `GA4_PRIVATE_KEY`, or any
  service-account key file to Git.
- Add `*.json` key files to `.gitignore`.
- The Measurement ID (`G-XXXXXXXXXX`) is not a secret — it must be embedded
  in the storefront's HTML so GA4 can receive browser events.
- The Property ID and service-account credentials are server-only secrets
  and must never be sent to the browser or logged.
- The `/api/website-analytics/config` endpoint returns only the Measurement ID
  (safe for public consumption) — it never returns the Property ID or
  credentials.

---

## Troubleshooting

### Dashboard shows "GA4 setup required" on all KPI cards
The GA4 environment variables are missing or incorrect. Run the health check
(Step 8) to see the specific error.

### KPI cards show numbers but the trend chart is flat / empty
The property may be new and has fewer than 7 days of data. Select a shorter
date range, or wait for more data to accumulate.

### "Visitor tracker not installed" pill in the header
The storefront is not loading `we-analytics.js`. Follow the storefront
installation steps in `WEBSITE_ANALYTICS.md`.

### Geography and traffic-source panels show only zeros
These panels rely on GA4 data. Check that the GA4 property is receiving events
in **GA4 → Reports → Realtime** and that at least one full day of data exists.

### Real-time card shows "API unavailable"
The GA4 Realtime API may be temporarily unavailable or quota-limited. The card
will retry automatically on the next 60-second refresh cycle.

### Numbers differ from the GA4 reports interface
This is expected. Common reasons:
- **Sampling** — the GA4 interface may sample large date ranges; the API does
  not sample in the same way.
- **Attribution model** — default attribution differs between the GA4 interface
  and the API depending on the report type.
- **Time zone** — verify `GA4_TIMEZONE=Asia/Kolkata` matches the property's
  configured time zone.
- **Processing delay** — GA4 data is typically processed within 24–48 hours;
  yesterday's data may still be incomplete.
- **Ad blockers** — browser-side GA4 events blocked by privacy tools will not
  appear in any GA4 report, including the API.

---

## Reference

| Resource | URL |
|---|---|
| GA4 property setup | https://support.google.com/analytics/answer/9304153 |
| GA4 Data API quickstart | https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart |
| GA4 Realtime API | https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema |
| Google Cloud service accounts | https://cloud.google.com/iam/docs/service-account-overview |
| GA4 dimensions and metrics | https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema |
| Storefront tracker | `WEBSITE_ANALYTICS.md` in this repository |
