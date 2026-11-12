# Validation - 2026-11-11

Integration branch: `integration/reports-ecommerce-ai-2026-11-11`
Baseline HEAD: `0921953b9794e5bfde809028c73b412e02ba244a`
Node `v24.7.0`, npm `11.7.0`, Next.js `15.1.6`.

## Results

| Check | Result | Evidence |
|---|---|---|
| Import resolution for every source file | PASS, with one pre-existing miss | `check-imports.js`: 1,001 files scanned; only `app/admin/transaction/intercompanysell/auto-purchases-return/add/[id]/page.jsx -> ../fields` is unresolved. That file is untouched by this integration and the target did not exist at baseline. |
| Production build | PASS | `npx next build` exited `0`: compiled successfully, generated 363/363 static pages, emitted the route table and middleware bundle. |
| New screens compiled | PASS | Route table contains `/admin/reports/customer-report`, `/admin/reports/stock-gallery-view`, `/admin/reports/supplier-summary-report`, `.../bill-wise`, `.../batch-wise`, `/admin/ai-assistant`, `/admin/ecommerce/product-eccom` and `/admin/ecommerce/product-eccom/add`. |
| Merge review: `product-eccom/page.jsx` | PASS | Main's bulk publish, selection and classification filters remain; only `fullExport`, live `dbQty`, null-field handling and the title were added. |
| Merge review: `product-eccom/add/page.jsx` | PASS | Main's classification options, selected-filter summary, image preview and publication behaviour remain; identify-lookup, manual-value preservation and notices were added. |
| Merge review: `Sidebar.jsx` | PASS | Nested submenu support is recursive, active detection is recursive, and no `target="_blank"` was reintroduced. |
| Merge review: navigation and permissions | PASS | `config/nav.js` contains the new report entries; `lib/navRegistry.js` and roles-permissions resources recurse into them. |
| API auth and scoping review | PASS for the new report routes; pre-existing guard gap recorded | All eight new report/customer-search/stock-gallery routes call `requireSession` and `screenDenial`, validate business/customer ids, cast ids for aggregation and pass business/location/finYear through the shared report scope. Three older routes (Customer Outstanding, Item Stock, Sales Analysis) authenticate but have no `screenDenial`; this was already true at baseline and is noted below. |
| Secret and environment handling | PASS | No secret was read, printed or changed. `next.config.mjs` was restored byte-for-byte after validation. |
| Unexpected file changes | PASS | The integration diff is 56 files: 37 modified and 19 added, matching the planned scope. Pre-existing user modifications (`app/api/ecom-product/route.js`, `product-type`, category pages, `NavTracker`, `wovenessenceV2.rar`, etc.) were not changed by this work. |

## Build notes

- The machine had under 600 MB free and the first build stopped on `ENOSPC` while writing the webpack cache. `npx next build` was repeated with the webpack filesystem cache temporarily disabled in `next.config.mjs`; the build then completed with `BUILD_EXIT=0`.
- `next.config.mjs` was restored immediately afterwards; `git diff -- next.config.mjs` is empty.
- Unrelated build output from the earlier attempt was removed (`.next`, a generated directory listed in `.gitignore`). `.next-dev` and the running dev server were left alone.
- The build log contains only pre-existing warnings: Mongoose's `errors` reserved-schema warning and Next's `metadataBase` warning. No compile, type or static-generation error occurred.

## Checks not applicable / not run

- `npm run lint`: no lint script or ESLint config exists in the project.
- `tsc --noEmit`: no `tsconfig.json` exists; Next's "checking validity of types" step had no TypeScript project to check.
- Automated test suite: no test runner is configured. The repository's `test:*` scripts connect to the configured database and several are migration/repair scripts, so they were not run against live data, per the integration constraints.
- Live API/browser smoke test: not performed. Starting authenticated sessions and querying real records would touch the configured live database; the production build plus static API review was used instead.

## Residual risks and follow-ups

1. **Pre-existing unresolved import** in `app/admin/transaction/intercompanysell/auto-purchases-return/add/[id]/page.jsx` (`../fields`). Not caused by, and not fixed as part of, this integration.
2. **Pre-existing permission gap**: `app/api/reports/customer-outstanding/route.js` authenticates the session but does not call `screenDenial`. The file had this shape at baseline and was replaced from the same route version; no new gap was introduced. It should be given a screen key and guard in a separate, reviewed change.
3. **New screen permissions**: the seven new keys in `lib/screenPermission.js` are now listed under Roles & Permissions. Roles that are already governed per business must be granted the new keys; unrestricted roles and ungoverned installations keep working.
4. **Database indexes** were added to `PosInvoice` and `SalesInvoice`. Mongoose may build them at startup depending on the deployment's `autoIndex` setting; in environments where automatic index creation is disabled, create them deliberately during the deployment window.
5. **`fastMode: true`** in the product-eccom `fullExport` config is present in the source export but is not read by `ListviewEccom` or `exportFullData`. It is inert; remove it in a later cleanup if desired.
6. **Legacy media**: `/images/...` paths now resolve against `ERP_MEDIA_ORIGIN` (default `https://erp.wovenessence.in`). Set `ERP_MEDIA_ORIGIN` on the server if the ERP media lives elsewhere. No image files were copied into this repository.
7. **No commit or push** was made. All integration changes remain in the working tree on the integration branch.
