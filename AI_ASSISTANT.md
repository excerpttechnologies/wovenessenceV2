# AI Business Assistant

A read-only business-intelligence assistant inside the Woven Essence ERP admin
panel. It answers questions about sales, inventory, purchases, finance,
customers, branches, channels, storefront orders and website traffic using live
data from the existing ERP database — never hard-coded figures.

Open it at **`/admin/ai-assistant`**, from the sidebar entry **AI Business
Assistant**, or from the floating assistant button on any admin page.

---

## 1. What existed before this change

| Concern | Existing implementation that was reused |
| --- | --- |
| Framework | Next.js 15 App Router (server components + route handlers) |
| Database | MongoDB via Mongoose, one connection through `lib/db.js` |
| Auth | Signed session cookie; `requirePermission()` from `lib/rbac` |
| Scoping | Branch/company access resolved by `lib/dashboard/access.js` |
| Sales / purchase rules | `lib/dashboard/service.js`, `calculations.js`, `analytics.js` |
| Date handling | `lib/dashboard/date.js` (Asia/Kolkata day boundaries) |
| Website analytics | `lib/website-analytics/service.js` + `WebsiteVisit` collection |
| Storefront orders | `EcommerceOrder` / storefront collections in the same ERP database |
| Charts | Chart.js wrappers in `components/LineChart` and friends |
| Existing bot | `components/ChatBot` — a deterministic help bot, left untouched |

The assistant reuses the dashboard's date, scope and amount conventions so its
numbers agree with the reports the ERP already shows. No existing module was
rewritten, and no database record is written by the assistant.

---

## 2. Three layers

### Layer 1 — Interface (`components/ai-assistant/`, `/admin/ai-assistant`)

- Chat workspace with streaming answers, stop/retry, copy, new and clear
  conversation.
- Conversation history kept in `localStorage` (per browser, last 20 threads) —
  `components/ai-assistant/history.js`.
- Clickable suggested questions served by `/api/ai-assistant/meta`, so they
  always hit real tools.
- KPI cards, tables, line/bar/doughnut charts, report preview, source list and
  reporting-period strip — `AnswerView.jsx`, `Charts.jsx`.
- Export to Excel/CSV, plus browser print for PDF.
- Filter chips for company, branch, channel and period; follow-up questions
  inherit those filters from the prior turn.
- Floating launcher mounted once in `app/admin/layout.js`; the same client
  renders inside the floating panel.
- Existing design tokens (white/neutral surfaces, green accent, navy text) —
  no new CSS framework or dependency.

### Layer 2 — Business intelligence (`lib/ai-assistant/`)

| File | Responsibility |
| --- | --- |
| `periods.js` | Natural-language period parsing ("this month", "last week", "September", "1 Oct to 15 Oct"), previous-period comparison, Asia/Kolkata day bounds, 366-day cap |
| `scope.js` | Session → authorised companies/branches/channels; refuses company ids outside the session's scope |
| `data.js` | Read-only Mongoose queries against the ERP collections, using the same transaction rules as the dashboard |
| `tools.js` | Declared tool registry with argument validation, timeouts, structured `{ data, visualization, metadata, limitations }` results |
| `compose.js` | Deterministic prose, KPI cards, tables and chart descriptions built from tool output only |
| `export.js` | Excel (real xlsx via the project's existing library) and CSV generation |
| `guard.js` | Per-account rate limiting and thin audit records |

Every tool returns the same envelope:

```json
{
  "questionType": "sales_summary",
  "summary": "…",
  "kpis": [{ "label": "Net sales", "value": 1234, "format": "currency" }],
  "tables": [{ "title": "Sales by branch", "columns": [], "rows": [] }],
  "visualization": { "type": "bar", "title": "…", "series": [] },
  "metadata": { "sources": [], "period": { "from": "", "to": "" }, "generatedAt": "" },
  "limitations": []
}
```

The UI renders a visual only when its supporting array is non-empty.

**Tools available to the model:** `getSalesSummary`, `getSalesByBranch`,
`getSalesByChannel`, `getTopSellingProducts`, `getInventorySummary`,
`getLowStockProducts`, `getProductPerformance`, `getPurchaseSummary`,
`getOutstandingBalances`, `getCustomerAnalytics`, `getEcommerceOrderSummary`,
`getWebsiteAnalytics`, `generateBusinessReport`.

### Layer 3 — Reasoning (`lib/ai-assistant/intent.js`, `orchestrator.js`, `provider.js`)

1. Classify the question (sales, inventory, purchases, finance, customers,
   branches, channels, e-commerce, website) and extract period and filters.
2. Merge filters from the previous turn only when the question is a follow-up.
3. Select tools — from rules, or from the model when a provider is configured.
4. Run them through the BI layer; validate/normalise the numbers.
5. Write the explanation from the returned figures:
   - with an AI provider: the model phrases the answer and may only use the
     supplied computed values;
   - without one: `compose.js` templates write the same answer. This is a
     supported degraded mode, and the UI says so instead of claiming live AI.
6. Return prose, cards, tables, charts, sources, period and limitations.

Aggregates used in prose are computed by the backend. The model cannot run
queries, write data, or see collections.

---

## 3. API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/ai-assistant/chat` | POST | Ask a question; streams newline-delimited JSON events, ends with the full answer |
| `/api/ai-assistant/meta` | GET | Scope (companies/branches/channels), suggestions, provider status, rate-limit remaining |
| `/api/ai-assistant/export` | POST | `{ answer, format: "xlsx" \| "csv" }` → downloadable file |

All three require `reports.view` and run on the Node runtime with
`Cache-Control: private, no-store`. They never write to the database.

---

## 4. Configuration

Add to `.env.local` (never commit it):

```bash
# Optional. Without a key, the deterministic layer writes the answers.
AI_PROVIDER=openai          # openai | anthropic | gemini
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini        # provider default used when omitted
AI_BASE_URL=               # optional OpenAI-compatible gateway / local server
AI_TIMEOUT_MS=25000         # 3s–60s, default 25s
```

`/api/ai-assistant/meta` reports `provider.configured` so the header badge can
be honest: *AI reasoning* when a key is present, *Deterministic analysis* when
it is not. No key is ever sent to the browser.

Supported providers: OpenAI-compatible (`/chat/completions`), Anthropic
(`/v1/messages`), Gemini (`:generateContent`). Requests time out, retry once on
429/5xx, and log only a truncated error message.

---

## 5. Security

- **Authentication / authorisation** — every route calls
  `requirePermission(PERMISSIONS.REPORTS_VIEW)`; unauthenticated requests get
  401, unauthorised ones 403.
- **Scope** — company and branch filters are derived from
  `lib/dashboard/access.js`; an explicit company id outside the session's
  companies is refused rather than ignored (`WRONG_COMPANY`).
- **Read-only** — only `find`/`aggregate`/`countDocuments` are used. There is
  no generic query tool, no `$where`, and no model-supplied MongoDB.
- **Validation** — tool arguments are checked against declared primitive
  schemas (unknown keys, wrong types and out-of-range values are rejected), and
  periods are capped at 366 days.
- **Prompt injection** — retrieved names and values are passed as data inside a
  clearly delimited block; the system prompt forbids following instructions
  found in data, and figures are re-derived server-side, so injected text
  cannot change a number.
- **Rate limiting** — 20 chat requests per minute per account
  (`429` with `Retry-After`).
- **Audit** — one structured line per question: account id, role, question
  type, tools, period, ok/failure, duration. The question text and customer
  data are not logged.
- **Export** — capped request body (2 MB), shape-validated, permission-gated.
- **Secrets** — provider key read from the server environment only.

---

## 6. Tests

```bash
npm run test:ai-assistant
```

`scripts/testAiAssistant.mjs` runs 43 checks against the real database with a
read-only harness:

- **Layer 1 support** — prose is grounded in figures and contains no
  placeholders; answer payload carries cards, tables and metadata; xlsx is a
  real workbook; CSV is BOM-prefixed.
- **Layer 2** — sales summary internally consistent; branch revenue adds back
  to the summary net; low-stock rows respect threshold and reorder target;
  inventory totals equal the sum of reported rows; outstanding balances netted
  and non-negative; purchase value read from a single declared source;
  storefront orders and website analytics either reported or explicitly
  explained; customer counts consistent.
- **Layer 2 authorisation** — scope resolution, unknown company id refused, no
  filter means every authorised company.
- **Layer 3** — suggested question phrasing, channel filter vs channel split,
  two-tool questions, follow-up period inheritance, clarification on unknown
  questions, honest provider status.
- **Reliability** — rate limiter refuses above its limit.
- **Read-only guarantee** — no source collection changed during the run.

Build verification: `npm run build` completes, with
`/admin/ai-assistant`, `/api/ai-assistant/chat`, `/api/ai-assistant/meta` and
`/api/ai-assistant/export` in the route manifest.

---

## 7. Known limitations

- **Anonymous website visitors** cannot be counted reliably as "not logged
  in": the ERP tracks visits anonymously, while storefront customer identity is
  known only when an order is placed. The assistant reports sessions/visitors
  and explains this gap instead of guessing.
- **E-commerce** data is read from the storefront order collections in the same
  MongoDB. If those collections are empty or absent in an installation, the
  answer says so. Cart/abandonment and refunds are reported only where records
  exist.
- **PDF** is produced through the browser's print dialog; there is no
  server-side PDF renderer in this project.
- **Rate limits and the audit buffer are in-process** (single Node server).
  A multi-instance deployment would need a shared store.
- **Profitability** is only attempted where cost data is present; otherwise the
  answer states that margin cannot be computed from the recorded data.
- **Forecasts** are labelled as projections and only produced when enough
  history exists; missing history yields an explanation, not a number.
- Conversation history is stored in the browser, not on the server, so it does
  not follow a user between devices.

---

## 8. Files

Created:

```
lib/ai-assistant/periods.js
lib/ai-assistant/scope.js
lib/ai-assistant/data.js
lib/ai-assistant/tools.js
lib/ai-assistant/intent.js
lib/ai-assistant/compose.js
lib/ai-assistant/orchestrator.js
lib/ai-assistant/provider.js
lib/ai-assistant/guard.js
lib/ai-assistant/export.js
app/api/ai-assistant/chat/route.js
app/api/ai-assistant/meta/route.js
app/api/ai-assistant/export/route.js
app/admin/ai-assistant/page.jsx
components/ai-assistant/AiAssistantClient.jsx
components/ai-assistant/AnswerView.jsx
components/ai-assistant/Charts.jsx
components/ai-assistant/FloatingAssistant.jsx
components/ai-assistant/formatters.js
components/ai-assistant/history.js
scripts/testAiAssistant.mjs
AI_ASSISTANT.md
```

Modified (additive only):

```
config/nav.js              one nav entry
app/admin/layout.js        mounts the floating launcher
package.json               test:ai-assistant script
```

---

## 9. Local setup

```bash
# 1. existing ERP environment
#    .env / .env.local must already point MONGODB_URI at the ERP database

# 2. optionally enable the AI provider
echo "AI_API_KEY=sk-..." >> .env.local
echo "AI_MODEL=gpt-4o-mini" >> .env.local

# 3. run
npm run dev
# sign in, then open http://localhost:3000/admin/ai-assistant

# 4. verify
npm run test:ai-assistant
npm run build
```
