# Integration report - Reports, E-commerce and AI Intelligence

Date: 2026-11-11

## 1. Outcome

The other developer's Reports, E-commerce and AI Intelligence work has been integrated into the main project without replacing the project or discarding main-branch work.

- Main project (source of truth): `C:\Users\Admin\Desktop\deploy\wovenessenceV2`
- Additional changes read from: `C:\Users\Admin\Downloads\wovenessenceV2 (1)` (partial export; no `package.json`)
- Integration branch: `integration/reports-ecommerce-ai-2026-11-11`
- Baseline: `main` at `0921953b9794e5bfde809028c73b412e02ba244a`
- Backup: `C:\Users\Admin\AppData\Local\Temp\opencode\wovenessenceV2-backup-2026-11-11` (2,074 source/config/env files, 130.2 MB)
- Scope delivered: **56 files** - 37 modified, 19 added
- Production build: **passed** (`npx next build`, exit 0, 363/363 static pages)
- No commit or push was made. All changes remain uncommitted on the integration branch.

The pre-existing uncommitted work in the main tree was preserved. In particular, files that were already modified before this integration (the active `app/api/ecom-product/route.js`, product-type admin, category pages, `NavTracker`, `wovenessenceV2.rar`, and others) were not replaced.

## 2. Method and safety

1. Compared every file under `app`, `components`, `config`, `lib` and `models` between main and the export. Line-ending-only differences were normalised so only content changes counted. Result: 44 content-different files and 21 files found only in the export.
2. Recorded the baseline branch/commit and all pre-existing working-tree changes.
3. Created a full source/config/env backup outside the project.
4. Created the integration branch with the user's working tree intact.
5. Wrote the comparison and ordered plan (`COMPARISON.md`, `PLAN.md`) before editing.
6. Applied the work in phases: shared foundations, Reports, E-commerce, AI, navigation, validation.
7. Reviewed every conflicting file individually. Changes were copied only where the export was a verified superset; overlapping files were merged by hand.
8. Ran import resolution and a production build. Wrote `VALIDATION.md` with results and residual risks.

No project-wide overwrite, `git reset`, `clean`, destructive migration, seed, or live-data repair was performed. No secret or `.env` value was read or exposed.

## 3. Phase-by-phase

### Phase 1 - shared foundations

Added the common services the new reports depend on:

- `lib/stockPosition.js` - the movement-ledger stock-position service used by Supplier Summary, Bill-wise and Batch-wise, so all three reports calculate opening/closing/movements once.
- `components/StockGallery.jsx` - the gallery UI.

Supporting changes:

- `lib/screenPermission.js` - seven new screen-permission keys for the new report screens.
- `lib/inventory.js` - `ERP_MEDIA_ORIGIN`, `erpImageForBarcode()` and legacy `/images/...` resolution to the ERP media host.
- `lib/format.js` - `count` formatter now accepts numeric values as well as arrays.
- `models/PosInvoice.js`, `models/SalesInvoice.js` - compound indexes for customer-report aggregation.
- `app/api/options/route.js` - GRC supplier filter accepts `supplierId`, `supplierNo`, and comma-separated id/code lists.

### Phase 2 - Reports

Added the new screens and APIs:

- Customer Report: customer search, summary, bills and items tabs.
- Stock Gallery View: card grid, unit drawer, server-side filtering/sorting/paging.
- Supplier Summary Report, Supplier Bill-wise Report and Supplier Batch-wise Report, including drill-down links that carry supplier, bill and date filters through the URL.

Updated the rewritten report routes and matching column/filter specifications:

- Customer Outstanding, Item Stock, Sales Analysis, Supplier Bill and Supplier Outstanding.
- `components/ReportView.jsx` gained URL filter seeding, `grid` filter layout, `locationAll`, `always` filters, filter-aware link columns, and the same `allLocations` handling on screen and export.

The report routes authenticate the session, enforce screen permissions, validate company/customer/location ids, and keep business/location/financial-year scoping on every query.

### Phase 3 - E-commerce

- `components/EccomProductFilterCard.jsx` - barcode-driven filter autofill with candidate selection.
- `components/ListviewEccom.jsx` - corrected image-column branch and `ProductImage` placeholder; full-export support.
- `app/api/product-eccom/route.js` - per-barcode product ownership, product type from item group, `productLookup`, `barcodeProfile`, uploaded-photo fallback, legacy ERP image fallback and live `dbQty`. This is the main route plus additive blocks, not a replacement of main behaviour.
- `app/admin/ecommerce/product-eccom/page.jsx` - hand-merged: main's bulk publish, selection UI and classification filters are retained; the export's full export action, live quantity, null-field handling and title were added.
- `app/admin/ecommerce/product-eccom/add/page.jsx` - hand-merged: main's classification options, selected-filter summary, image preview and `isActive`/`isPublished` behaviour are retained; the export's identify-by-field lookup, manual-value preservation and lookup notices were added.

Kept main deliberately:

- `app/api/ecom-product/route.js` (the active main implementation)
- `app/admin/ecommerce/product-type/page.jsx`
- `app/api/v1/admin/product-types/route.js`

### Phase 4 - AI Intelligence

- Renamed the screen to **AI Intelligence** and updated metadata, welcome copy and provider status.
- Added general-question mode in `intent.js` / `orchestrator.js`: greetings, explanation, writing, code and arithmetic go to the model without ERP tools and are explicitly told not to invent business figures. Business questions keep the existing tool-grounded path.
- Added per-call `temperature` / `maxTokens` support in `provider.js`, and updated compose/export/formatter naming.
- Kept main's newer `lib/ai-assistant/periods.js` and `scope.js`.

### Phase 5 - Navigation and permissions

- `config/nav.js` - added Customer Reports (nested), Supplier Summary, Bill-wise, Batch-wise and Stock Gallery View; renamed the assistant to AI Intelligence.
- `components/Sidebar.jsx` - ported nested-submenu rendering and active-route detection, but **did not** reintroduce `target="_blank"`; links continue to open in the same tab.
- `lib/navRegistry.js` - made recursive so nested Customer Reports entries are tracked and resolvable.
- `app/admin/staff-management/roles-permissions/fields.js` - collects resources recursively, so the new nested screens can be granted.

### Phase 6 - Validation

See `VALIDATION.md` for the full record. Summary:

- Import check: 1,001 files scanned; the only unresolved import is a pre-existing unrelated `../fields` in `intercompanysell/auto-purchases-return`.
- Production build: passed, all new screens present in the route table.
- Manual contract review: auth, permissions, business/location/finYear scoping, URL drill-downs, merge diffs and the no-`target="_blank"` rule.
- No automated test suite, lint script, or TypeScript project exists; the repository's `test:*` scripts use the configured live database and were not run.

## 4. Files modified (37)

1. `app/admin/ai-assistant/page.jsx`
2. `app/admin/ecommerce/product-eccom/add/page.jsx`
3. `app/admin/ecommerce/product-eccom/page.jsx`
4. `app/admin/reports/customer-outstanding/fields.js`
5. `app/admin/reports/item-stock/fields.js`
6. `app/admin/reports/sales-analysis/fields.js`
7. `app/admin/reports/supplier-bill/fields.js`
8. `app/admin/reports/supplier-outstanding/fields.js`
9. `app/admin/staff-management/roles-permissions/fields.js`
10. `app/api/options/route.js`
11. `app/api/product-eccom/route.js`
12. `app/api/reports/customer-outstanding/route.js`
13. `app/api/reports/item-stock/route.js`
14. `app/api/reports/sales-analysis/route.js`
15. `app/api/reports/supplier-bill/route.js`
16. `app/api/reports/supplier-outstanding/route.js`
17. `components/EccomProductFilterCard.jsx`
18. `components/ListviewEccom.jsx`
19. `components/ReportView.jsx`
20. `components/Sidebar.jsx`
21. `components/ai-assistant/AiAssistantClient.jsx`
22. `components/ai-assistant/AnswerView.jsx`
23. `components/ai-assistant/FloatingAssistant.jsx`
24. `components/ai-assistant/formatters.js`
25. `config/nav.js`
26. `lib/ai-assistant/compose.js`
27. `lib/ai-assistant/data.js`
28. `lib/ai-assistant/export.js`
29. `lib/ai-assistant/intent.js`
30. `lib/ai-assistant/orchestrator.js`
31. `lib/ai-assistant/provider.js`
32. `lib/format.js`
33. `lib/inventory.js`
34. `lib/navRegistry.js`
35. `lib/screenPermission.js`
36. `models/PosInvoice.js`
37. `models/SalesInvoice.js`

## 5. Files added (19)

1. `app/admin/reports/customer-report/page.jsx`
2. `app/admin/reports/stock-gallery-view/page.jsx`
3. `app/admin/reports/supplier-summary-report/page.jsx`
4. `app/admin/reports/supplier-summary-report/fields.js`
5. `app/admin/reports/supplier-summary-report/bill-wise/page.jsx`
6. `app/admin/reports/supplier-summary-report/bill-wise/fields.js`
7. `app/admin/reports/supplier-summary-report/batch-wise/page.jsx`
8. `app/admin/reports/supplier-summary-report/batch-wise/fields.js`
9. `app/api/reports/customer-report/shared.js`
10. `app/api/reports/customer-report/summary/route.js`
11. `app/api/reports/customer-report/bills/route.js`
12. `app/api/reports/customer-report/items/route.js`
13. `app/api/reports/customers/search/route.js`
14. `app/api/reports/stock-gallery/route.js`
15. `app/api/reports/supplier-summary/route.js`
16. `app/api/reports/supplier-bill-wise/route.js`
17. `app/api/reports/supplier-batch-wise/route.js`
18. `components/StockGallery.jsx`
19. `lib/stockPosition.js`

Integration documentation added separately:

- `docs/integration/BASELINE.md`
- `docs/integration/COMPARISON.md`
- `docs/integration/PLAN.md`
- `docs/integration/VALIDATION.md`
- `docs/integration/REPORT.md` (this file)

## 6. Main-only work preserved

- `components/NavTracker.jsx` and its mount in `app/admin/layout.js`.
- `FrequentlyPagesNav` tracking through `NavTracker` instead of tracking internally.
- Same-tab sidebar navigation (no `target="_blank"`).
- Bulk publish and selected-product UI on the product list.
- Current classification-option loading and selected-filter summary on the product form.
- The active `/api/ecom-product` route, product-type page and product-type admin API.
- Newer `ReleaseAnnouncement` error/retry/All-releases behaviour.
- Newer AI assistant periods/scope wording.

## 7. Excluded from the export

- `lib/rag/corpus.js` and `lib/rag/store.js` - not imported anywhere and incomplete/dead code.
- `node_modules`, `.next`, `.next-dev`, `.git`, logs, caches, uploads, media, archives and generated files.

## 8. Deployment notes and residual risks

1. **Permissions** - grant the new report screens to governed roles under Staff Management > Roles & Permissions. Unrestricted roles and installations with no per-business matrix keep working.
2. **Indexes** - the new compound indexes on `PosInvoice` and `SalesInvoice` should be built during a deployment window if the environment disables automatic index creation.
3. **Legacy media** - set `ERP_MEDIA_ORIGIN` if ERP photos are not served from `https://erp.wovenessence.in`. No media files were copied into the repository.
4. **Pre-existing broken import** - `app/admin/transaction/intercompanysell/auto-purchases-return/add/[id]/page.jsx` imports `../fields`, which does not exist. It is untouched by this integration and remains a separate fix.
5. **Pre-existing permission gap** - the Customer Outstanding API authenticates but does not call `screenDenial`. This was already true at baseline and was not changed here; it should be addressed separately with a proper screen key.
6. **Inert flag** - `fastMode` in the product full-export config is carried from the source export but is not consumed by the list component. It has no runtime effect and can be removed later.
7. **Live smoke test not performed** - the build and static API review passed, but authenticated browser/API checks against real records were intentionally not run to avoid touching live data.

## 9. Recommended review steps

1. `git diff --stat` on the integration branch and review the 37 modified files.
2. Open the new screens: Reports > Customer Report, Reports > Supplier Summary / Bill-wise / Batch-wise, Reports > Stock Gallery View.
3. Walk the drill-down: Supplier Summary -> supplier link -> Bill-wise -> bill link -> Batch-wise -> item code -> Item Stock. The URL should seed the next screen's filters.
4. Check E-commerce Products list export and Add-product identify lookup with a real item/barcode.
5. Ask AI Intelligence one business question and one general question (the latter needs `AI_API_KEY`).
6. Grant the new screens to a governed role and confirm access is denied before the grant and allowed afterwards.
7. Run `npx next build` in an environment with sufficient disk space before deployment.
