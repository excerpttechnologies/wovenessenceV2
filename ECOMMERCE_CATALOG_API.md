# E-commerce Catalog API

E-commerce metadata is stored in MongoDB collection `ecommerceproduct`, separate from the ERP `item` collection. Each catalog document is linked by `businessId` and `itemId`. Barcode quantities and stock remain in the existing barcode inventory system.

## Backfill Existing Metadata

Run the dry run first:

```powershell
npm run migrate:ecommerce
```

Review the candidate and existing counts. Apply the non-destructive copy only when they are expected:

```powershell
npm run migrate:ecommerce:apply
```

The migration never deletes or updates Item records. Existing e-commerce catalog records are not overwritten.

## Storefront Read API

`GET /api/v1/storefront/products?business=<businessId>&page=1&perPage=24`

Optional `search` filters by display name, slug, or product type. Results include only records where `status` is `active` and `isPublished` is `true`.

Authenticate with a server-side bearer key:

```http
Authorization: Bearer <STOREFRONT_API_KEY>
```

Set the same secret in the ERP deployment as `STOREFRONT_API_KEY` and in the separately deployed storefront's server environment. Do not expose this value to browser JavaScript or use a `NEXT_PUBLIC_` variable. The storefront should fetch this endpoint from its server-side code and pass only returned public product data to the browser.

The response contains `rows`, `total`, `page`, `perPage`, and `pages`. Each row contains the linked item ID/code, storefront name, description, product type, image/gallery, price/discount, classifications, slug, SEO fields, publication/featured status, `stock`, and `availableForSale`. Product metadata comes from `EcommerceProduct`; stock is calculated from `BarcodeLabel` rows currently in stock and owned by the requested business. History, sold, void, and transferred-out barcode rows are not counted as available. Private ERP purchase-cost and supplier information are not returned.

This is a read-only aggregation of the existing ERP inventory source, not a second stock quantity or inventory system.
