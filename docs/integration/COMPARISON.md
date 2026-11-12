# Change detection report - 2026-11-11

Comparison basis: every file in `app`, `components`, `config`, `lib`, `models` of the main
project vs the Downloads export. Line-ending-only differences were normalised away
(CRLF/LF), so this list is content changes only.

Result: **44 content-different files** and **21 files that exist only in the export**.
Everything else (822+ files) is byte-identical after line-ending normalisation.

## Decisions

- **INTEGRATE** - the export adds a feature the main branch does not have, or is a
  substantive report rewrite that the main branch has not touched.
- **MERGE** - both sides changed the same file for different reasons. Main's work is
  preserved and only the export's additive feature is ported.
- **KEEP MAIN** - main is newer, or the export would regress a deliberate main change.
- **SKIP** - dead/unused code, or outside the agreed Reports / E-commerce / AI scope.

## Files changed on both sides (44)

| # | File | Decision | Why |
|---|------|----------|-----|
| 1 | `app/admin/layout.js` | KEEP MAIN | Main mounts `NavTracker` inside `ScopeProvider`; export has no tracker. |
| 2 | `app/admin/ai-assistant/page.jsx` | INTEGRATE | Rename to AI Intelligence + new metadata description. |
| 3 | `app/admin/ecommerce/product-eccom/page.jsx` | MERGE | Keep main's uncommitted bulk publish, selection UI and classification filters; port export's `fullExport`, live `dbQty`, null-field handling, title. |
| 4 | `app/admin/ecommerce/product-eccom/add/page.jsx` | MERGE | Keep main's newer classification-options loading, selected-filter summary and image preview; port export's identify-by-field autofill, manual-value preservation, lookup notices and product-ownership warning. Export's `isActive`/`isPublished` form changes are not adopted (main deliberately governs publication from the list). |
| 5 | `app/admin/ecommerce/product-type/page.jsx` | KEEP MAIN | Main has newer filters/permissions work. |
| 6 | `app/api/ecom-product/route.js` | KEEP MAIN | Main working tree is a new 244-line active route; export is the old 916-line implementation. |
| 7 | `app/api/options/route.js` | INTEGRATE | GRC supplier filter accepts `supplierId` / comma lists as well as `supplierNo`. |
| 8 | `app/api/product-eccom/route.js` | INTEGRATE | Per-barcode ownership, product type from item group, `productLookup`, `barcodeProfile`, uploaded-photo fallback, legacy ERP image fallback, live `dbQty`. Purely additive in the route tail. |
| 9 | `app/api/reports/customer-outstanding/route.js` | INTEGRATE | ObjectId casting fix, pagination and tiles. |
| 10 | `app/api/reports/item-stock/route.js` | INTEGRATE | Substantive rewrite: group/item filters, UOM, scoped aggregation. |
| 11 | `app/api/reports/sales-analysis/route.js` | INTEGRATE | Reads SalesInvoice/SalesReturn/PosInvoice/PosReturn directly; `allLocations`. |
| 12 | `app/api/reports/supplier-bill/route.js` | INTEGRATE | Rewritten onto the shared stock-position service. |
| 13 | `app/api/reports/supplier-outstanding/route.js` | INTEGRATE | Pagination/tiles/scoping fix. |
| 14 | `app/api/v1/admin/product-types/route.js` | KEEP MAIN | Main adds per-type `filters`; export is older. |
| 15 | `app/admin/reports/customer-outstanding/fields.js` | INTEGRATE | Tiles, `locationAll`, detailed bill columns. |
| 16 | `app/admin/reports/item-stock/fields.js` | INTEGRATE | `locationAll`, `always` filters, group/item filters, UOM. |
| 17 | `app/admin/reports/sales-analysis/fields.js` | INTEGRATE | `locationAll` only. |
| 18 | `app/admin/reports/supplier-bill/fields.js` | INTEGRATE | New filter/column set for rewritten route. |
| 19 | `app/admin/reports/supplier-outstanding/fields.js` | INTEGRATE | Tiles/`locationAll`. |
| 20 | `app/admin/staff-management/roles-permissions/fields.js` | INTEGRATE | Recursive sidebar resources, required by the new nested Customer Reports menu. |
| 21 | `components/EccomProductFilterCard.jsx` | INTEGRATE | Barcode-driven filter autofill with candidate selection; compact layout. |
| 22 | `components/FrequentlyPagesNav.jsx` | KEEP MAIN | Main delegates tracking to `NavTracker`; export tracks internally (would double-count). |
| 23 | `components/ListviewEccom.jsx` | INTEGRATE | Fixes image-column branch and uses `ProductImage` placeholder. |
| 24 | `components/ReportView.jsx` | INTEGRATE | URL filter seeding, `grid` layout, `locationAll`, `always` filters, filter-aware links. |
| 25 | `components/Sidebar.jsx` | MERGE | Port nested submenu support only. Do **not** reintroduce `target="_blank"`; main removed it deliberately. |
| 26 | `components/ai-assistant/AiAssistantClient.jsx` | INTEGRATE | AI Intelligence naming, time-aware welcome, provider status copy. |
| 27 | `components/ai-assistant/AnswerView.jsx` | INTEGRATE | Print title naming. |
| 28 | `components/ai-assistant/FloatingAssistant.jsx` | INTEGRATE | Accessible naming. |
| 29 | `components/ai-assistant/formatters.js` | INTEGRATE | Plain-text export naming. |
| 30 | `components/dashboard/ReleaseAnnouncement.jsx` | KEEP MAIN | Main has retry/error/All-releases work; export is older. |
| 31 | `config/nav.js` | INTEGRATE | Customer Reports submenu, supplier stock reports, Stock Gallery, AI Intelligence rename. |
| 32 | `lib/format.js` | INTEGRATE | `count` formatter handles numeric values (needed by new report tiles). |
| 33 | `lib/inventory.js` | INTEGRATE | `ERP_MEDIA_ORIGIN` + `erpImageForBarcode`; legacy `/images/...` resolves to ERP media origin. |
| 34 | `lib/screenPermission.js` | INTEGRATE | New report screen keys. |
| 35 | `lib/ai-assistant/compose.js` | INTEGRATE | General mode summary + naming. |
| 36 | `lib/ai-assistant/data.js` | INTEGRATE | Comment naming only. |
| 37 | `lib/ai-assistant/export.js` | INTEGRATE | Export naming. |
| 38 | `lib/ai-assistant/intent.js` | INTEGRATE | `general` question type, general prompts, undated tools. |
| 39 | `lib/ai-assistant/orchestrator.js` | INTEGRATE | General conversation mode + meta suggestions. |
| 40 | `lib/ai-assistant/periods.js` | KEEP MAIN | Main already says "AI Intelligence"; export is older wording. |
| 41 | `lib/ai-assistant/provider.js` | INTEGRATE | Per-call temperature / maxTokens. |
| 42 | `lib/ai-assistant/scope.js` | KEEP MAIN | Main already says "AI Intelligence"; export is older wording. |
| 43 | `models/PosInvoice.js` | INTEGRATE | Customer-report compound index. |
| 44 | `models/SalesInvoice.js` | INTEGRATE | Customer-report compound index. |

## Files only in the export (21)

| # | File | Decision | Why |
|---|------|----------|-----|
| 1 | `app/admin/reports/customer-report/page.jsx` | INTEGRATE | New Customer Report screen. |
| 2 | `app/api/reports/customer-report/shared.js` | INTEGRATE | Customer report aggregation. |
| 3 | `app/api/reports/customer-report/bills/route.js` | INTEGRATE | Bill tab. |
| 4 | `app/api/reports/customer-report/items/route.js` | INTEGRATE | Item tab. |
| 5 | `app/api/reports/customer-report/summary/route.js` | INTEGRATE | Summary header. |
| 6 | `app/api/reports/customers/search/route.js` | INTEGRATE | Customer picker search. |
| 7 | `app/admin/reports/stock-gallery-view/page.jsx` | INTEGRATE | New Stock Gallery screen. |
| 8 | `app/api/reports/stock-gallery/route.js` | INTEGRATE | Gallery data + unit drawer. |
| 9 | `components/StockGallery.jsx` | INTEGRATE | Gallery UI. |
| 10 | `lib/stockPosition.js` | INTEGRATE | Shared ledger-based stock position service. |
| 11 | `app/admin/reports/supplier-summary-report/page.jsx` | INTEGRATE | Supplier Summary screen. |
| 12 | `app/admin/reports/supplier-summary-report/fields.js` | INTEGRATE | Spec. |
| 13 | `app/admin/reports/supplier-summary-report/bill-wise/page.jsx` | INTEGRATE | Bill-wise screen. |
| 14 | `app/admin/reports/supplier-summary-report/bill-wise/fields.js` | INTEGRATE | Spec. |
| 15 | `app/admin/reports/supplier-summary-report/batch-wise/page.jsx` | INTEGRATE | Batch-wise screen. |
| 16 | `app/admin/reports/supplier-summary-report/batch-wise/fields.js` | INTEGRATE | Spec. |
| 17 | `app/api/reports/supplier-summary/route.js` | INTEGRATE | Summary route. |
| 18 | `app/api/reports/supplier-bill-wise/route.js` | INTEGRATE | Bill-wise route. |
| 19 | `app/api/reports/supplier-batch-wise/route.js` | INTEGRATE | Batch-wise route. |
| 20 | `lib/rag/corpus.js` | SKIP | Not imported anywhere; incomplete/dead code. |
| 21 | `lib/rag/store.js` | SKIP | Not imported anywhere; incomplete/dead code. |

## Shared dependencies verified

- `lib/reports.js` already exports `json`, `num`, `r2`, `scopeOf`, `pageOf`, `scopeFilter`,
  `dateRange` - no change needed.
- `lib/validate.js` already exports `escapeRegex`.
- `lib/barcodeLabel.js` already exports `BarcodeLabel`, `BARCODE_STATUS`.
- `lib/contacts.js` already exports `Supplier`, `Agent`, `Customer`.
- `lib/classificationCollections.js` already exports `classificationOptionsById`,
  `listClassificationOptions`, `businessMatch`.
- `ProductImage`, `ProductGroup`, `Item`, `Uom`, `Hsn` models already exist.
- `react-icons/lu` already provides every new icon used by the menu.
- No `package.json` change is indicated by the export (it contains no manifest).

## Main-only work that must survive

- `components/NavTracker.jsx` (untracked) and its mount in `app/admin/layout.js`.
- `FrequentlyPagesNav` using `NavTracker` rather than tracking internally.
- Sidebar links that stay in the same tab (no `target="_blank"`).
- Bulk publish + selected-product UI in `product-eccom/page.jsx`.
- Classification-options loading + selected-filter summary in `product-eccom/add/page.jsx`.
- Newer product-type admin API and page.
- Newer ReleaseAnnouncement error/retry/All-releases handling.
- Active `/api/ecom-product` route in the working tree.
