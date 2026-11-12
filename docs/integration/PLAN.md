# Integration plan - 2026-11-11

Order: shared foundations -> Reports -> E-commerce -> AI -> navigation -> validation.
Every step is additive relative to main's uncommitted working tree.

## Phase 0 - safety (done)

1. Full source backup: `C:\Users\Admin\AppData\Local\Temp\opencode\wovenessenceV2-backup-2026-11-11`
   (2,074 files / 130.2 MB, all source + config + .env; only generated/media/archive
   assets excluded because the volume has ~580 MB free and `public` alone is ~2 GB).
2. Baseline recorded: branch `main`, HEAD `0921953b9794e5bfde809028c73b412e02ba244a`.
3. Integration branch created with the uncommitted tree intact:
   `integration/reports-ecommerce-ai-2026-11-11`.
4. `docs/integration/BASELINE.md`, `COMPARISON.md`, `PLAN.md` written before code changes.

## Phase 1 - shared foundations

New:
- `lib/stockPosition.js`
- `components/StockGallery.jsx`

Changed:
- `lib/screenPermission.js` - add 7 report screen keys.
- `lib/inventory.js` - `ERP_MEDIA_ORIGIN`, `erpImageForBarcode`, legacy image prefix.
- `lib/format.js` - numeric `count`.
- `models/PosInvoice.js`, `models/SalesInvoice.js` - customer-report indexes.
- `app/api/options/route.js` - GRC supplier filter accepts ids/codes/comma lists.

## Phase 2 - Reports

Replace/apply from export (main has no local edits in these files):
- `app/api/reports/customer-outstanding/route.js`
- `app/api/reports/item-stock/route.js`
- `app/api/reports/sales-analysis/route.js`
- `app/api/reports/supplier-bill/route.js`
- `app/api/reports/supplier-outstanding/route.js`
- matching `fields.js` files
- `components/ReportView.jsx`

Add:
- `app/api/reports/customer-report/{shared.js,bills,items,summary}`
- `app/api/reports/customers/search/route.js`
- `app/admin/reports/customer-report/page.jsx`
- `app/api/reports/stock-gallery/route.js`
- `app/admin/reports/stock-gallery-view/page.jsx`
- `app/api/reports/supplier-summary/route.js`
- `app/api/reports/supplier-bill-wise/route.js`
- `app/api/reports/supplier-batch-wise/route.js`
- `app/admin/reports/supplier-summary-report/**`

## Phase 3 - E-commerce

- `components/EccomProductFilterCard.jsx` - replace with export version (barcode autofill).
- `components/ListviewEccom.jsx` - replace with export version (image branch + ProductImage).
- `app/api/product-eccom/route.js` - add ownership/type/lookup/profile/photo/`dbQty` blocks.
- `app/admin/ecommerce/product-eccom/page.jsx` - merge `fullExport`, `dbQty`, null handling,
  title; keep main bulk publish and selection.
- `app/admin/ecommerce/product-eccom/add/page.jsx` - merge identify-autofill, manual-value
  preservation, lookup notices; keep main classification options/summary/image preview.
- Keep main: `app/api/ecom-product/route.js`, `product-type/page.jsx`,
  `app/api/v1/admin/product-types/route.js`.

## Phase 4 - AI Intelligence

- `app/admin/ai-assistant/page.jsx` - replace.
- `lib/ai-assistant/intent.js`, `orchestrator.js`, `provider.js`, `compose.js`,
  `data.js`, `export.js` - apply export additions.
- `components/ai-assistant/AiAssistantClient.jsx`, `AnswerView.jsx`,
  `FloatingAssistant.jsx`, `formatters.js` - apply export additions.
- Keep main: `periods.js`, `scope.js` (already use the newer AI Intelligence wording).

## Phase 5 - Navigation and permissions

- `config/nav.js` - apply new report entries + AI rename.
- `components/Sidebar.jsx` - port nested-submenu support only; no `target="_blank"`.
- `lib/navRegistry.js` - recurse nested children so the new submenu entries are trackable
  and the activity API can resolve them (required support; export itself missed this).
- `app/admin/staff-management/roles-permissions/fields.js` - recursive resources.
- Keep main: `app/admin/layout.js`, `components/FrequentlyPagesNav.jsx`,
  `components/dashboard/ReleaseAnnouncement.jsx`.

## Phase 6 - validation

1. Import/dependency check for every new and changed module.
2. `npm run lint` (or `npx next lint`) if the project defines it.
3. `npx tsc --noEmit` only if `tsconfig.json` exists.
4. `npm run build` (Next.js production build).
5. Existing tests (`__tests__`) if a runner is configured.
6. Manual API contract review: auth/session, business/location/finYear scoping,
   screen permissions, no invented fields or collections.
7. Record results in `docs/integration/VALIDATION.md` and summarise the final report.

## Explicitly not doing

- No whole-project replacement, no `git reset`, `clean`, or deletion of user work.
- No destructive migrations, seeds, or production data access.
- No mock data, invented Mongo fields/collections/routes, duplicated implementations,
  or secret exposure.
- No `lib/rag/*` (unused).
- No `package.json` changes (none are indicated).
