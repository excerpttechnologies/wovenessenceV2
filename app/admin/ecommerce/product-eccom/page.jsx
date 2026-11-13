// 'use client';
// import { useEffect, useMemo, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import ListView from '@/components/ListviewEccom';
// import Modal from '@/components/Modal';
// import Icon from '@/components/Icon';
// import { useScope } from '@/components/ScopeContext';

// /* E-commerce -> product-eccom (19-10-2026).

//    A test screen over the `ecommerceproduct` collection that the separate
//    e-commerce project writes (built there from barcodeLabel). Read through
//    /api/product-eccom, which returns the documents exactly as stored.

//    THE COLUMNS ARE THE COLLECTION'S OWN FIELDS. The page first asks the API
//    which fields the documents carry (?fields=1) and makes one column per
//    field, so a field added or renamed on the e-commerce side appears here
//    with no change to this file. The most useful ones are put first; the rest
//    follow in the order the collection has them. Column visibility hides any.

//    ADD opens ./add - a form with one input per field of the collection. The
//    row action opens the Item the product was made from. */

// /* shown first, in this order, when the collection has them */
// const FIRST = [
//   'ecommItemCode', 'productType', 'isPublished', 'isFeatured',
//   'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount', 'slug',
// ];

// /* camelCase -> "Camel Case" */
// const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
// const isId = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));
// const CLASSIFICATION_COLUMNS = new Set(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']);
// const HIDDEN_COLUMNS = new Set([
//   'barcodeQtyOverride', 'barcodeQualityOverride', 'barcodePriceOverride',
//   'colorDescription', 'colourDescription', 'craftDescription', 'fabricDescription',
//   'occasionDescription', 'printDescriptionOverride', 'weaveDescription',
//   'image', 'images', 'additionalImages', 'byColour',
//   /* only Is Published decides what the website shows */
//   'status', 'isActive',
// ]);

// function columnFor({ k, type }) {
//   if (k === 'barcode') return { k, t: 'Barcode', value: (r) => r.barcode || '' };
//   if (k === 'ecommItemCode') return { k, t: 'E-Comm Item Code' };
//   if (k === 'businessId') return { k, t: 'Business', value: (r) => r.businessName || r.businessId || '' };
//   if (k === 'itemId') return { k, t: 'Item', value: (r) => r.itemLabel || r.itemId || '' };
//   if (CLASSIFICATION_COLUMNS.has(k)) {
//     return { k, t: labelOf(k), minWidth: 170, value: (r) => r[`${k}Display`] || '' };
//   }
//   const t = labelOf(k);
//   if (type === 'boolean') return { k, t, f: 'yesno' };
//   if (type === 'date') return { k, t, f: 'datetime' };
//   if (type === 'array') {
//     return {
//       k, t,
//       value: (r) => {
//         const list = Array.isArray(r[k]) ? r[k] : [];
//         if (!list.length) return '';
//         if (list.every(isId)) return String(list.length);
//         return list.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
//       },
//     };
//   }
//   if (type === 'text' || type === 'number' || type === 'id') {
//     return { k, t, value: (r) => (r[k] && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) };
//   }
//   return { k, t };
// }

// const editHref = (r) => '/admin/ecommerce/product-eccom/add' + (r.barcode ? '?barcode=' + encodeURIComponent(r.barcode) : '');

// /* The View popup: the row's saved fields, read-only. Rows already carry the display names
//    (business, item, by* classifications) and the image, so nothing more is fetched. */
// const VIEW_FIELDS = [
//   ['Barcode', (r) => r.barcode],
//   ['Product Name', (r) => r.displayName],
//   ['E-Comm Item Code', (r) => r.ecommItemCode],
//   ['Product Type', (r) => r.productType],
//   ['Item', (r) => r.itemLabel],
//   ['Business', (r) => r.businessName],
//   ['Is Published', (r) => (r.isPublished ? 'Yes' : 'No')],
//   ['Is Featured', (r) => (r.isFeatured ? 'Yes' : 'No')],
//   ['Price', (r) => r.barcodePriceOverride],
//   ['Quantity', (r) => r.barcodeQtyOverride],
//   ['E-Comm Off (%)', (r) => r.ecommOffPercent],
//   ['By Weave', (r) => r.byWeaveDisplay],
//   ['By Fabric', (r) => r.byFabricDisplay],
//   ['By Craft', (r) => r.byCraftDisplay],
//   ['By Occasion', (r) => r.byOccasionDisplay],
//   ['By Colour', (r) => r.byColourDisplay],
//   ['Print Description', (r) => r.printDescriptionOverride],
//   ['Slug', (r) => r.slug],
//   ['SEO Title', (r) => r.seoTitle],
//   ['SEO Description', (r) => r.seoDescription],
//   ['Additional Images', (r) => (Array.isArray(r.additionalImages) ? r.additionalImages.join(', ') : r.additionalImages)],
//   ['Created At', (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '')],
//   ['Updated At', (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '')],
// ];

// function ProductView({ row }) {
//   return (
//     <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
//       <div>
//         {row.barcodeImage
//           ? <img src={row.barcodeImage} alt={row.displayName || row.barcode || 'Product image'} className="w-full rounded border border-line object-cover" />
//           : <div className="flex h-40 items-center justify-center rounded border border-line text-[12px] text-inkmuted">No image</div>}
//       </div>
//       <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
//         {VIEW_FIELDS.map(([label, get]) => {
//           const value = get(row);
//           return (
//             <div key={label} className="border-b border-line pb-1.5">
//               <dt className="text-[11px] uppercase text-inkmuted">{label}</dt>
//               <dd className="break-words text-ink">{value === undefined || value === null || value === '' ? '—' : String(value)}</dd>
//             </div>
//           );
//         })}
//       </dl>
//     </div>
//   );
// }

// export default function ProductEccomPage() {
//   const router = useRouter();
//   const { business } = useScope();
//   const [fields, setFields] = useState(null);
//   const [viewing, setViewing] = useState(null);

//   useEffect(() => {
//     /* wait for the scoped business before asking the API for field metadata -
//        firing with an empty business= produced an incomplete/empty field list
//        on first paint, which could in turn hide columns (and the data under
//        them) on the very first render after navigating here. */
//     if (!business) return undefined;
//     let off = false;
//     setFields(null);
//     fetch('/api/product-eccom?fields=1&business=' + business, { cache: 'no-store' })
//       .then((r) => r.json())
//       .then((d) => { if (!off) setFields(Array.isArray(d.fields) ? d.fields : []); })
//       .catch(() => { if (!off) setFields([]); });
//     return () => { off = true; };
//   }, [business]);

//   const cfg = useMemo(() => {
//     const list = fields || [];
//     /* NOTE: only displayName is excluded here. ecommItemCode must stay in
//        `visible` — it's also the first entry in FIRST/preferred below, and
//        excluding it here meant that lookup returned nothing for it, so the
//        column (and the data under it) silently vanished from the table via
//        the final .filter(Boolean), even though the field and its data exist
//        on every row. */
//     const visible = list.filter((f) => f.k !== 'displayName' && !HIDDEN_COLUMNS.has(f.k));
//     const preferred = ['barcode', ...FIRST, 'businessId', 'itemId'];
//     const ordered = [
//       ...preferred.map((k) => visible.find((f) => f.k === k)
//         || (['barcode', 'businessId', 'itemId'].includes(k) ? { k, type: 'text' }
//           : null)).filter(Boolean),
//       ...visible.filter((f) => !preferred.includes(f.k)),
//     ];
//     return {
//       title: 'product-eccom',
//       basePath: '/admin/ecommerce/',
//       slugPath: 'product-eccom',
//       endpoint: '/api/product-eccom',
//       scope: ['business'],
//       /* ADD opens a form with every field of the collection (./add) */
//       addHref: '/admin/ecommerce/product-eccom/add',
//       pager: 'numbered',
//       sortable: true,
//       actionVariant: 'dropdown',
//       actionMenu: [
//         { label: 'View', icon: 'eye', onClick: (r) => setViewing(r) },
//         {
//           /* the Add form loads the saved product by its barcode and Save updates it (one per item) */
//           label: 'Edit',
//           icon: 'pencil',
//           to: editHref,
//         },
//         // {
//         //   label: 'Edit Item',
//         //   icon: 'box',
//         //   to: (r) => '/admin/inventory/item/' + r.itemId,
//         // },
//       ],
//       columns: [
//         { k: 'barcodeImage', t: 'Images', f: 'image', value: (r) => r.barcodeImage || '' },
//         ...ordered.map(columnFor),
//       ],
//     };
//   }, [fields]);

//   if (!business) return <div className="card p-6 text-[13px] text-inkmuted">Select a Business in the top bar first.</div>;
//   if (fields === null) return <div className="card p-6 text-[13px] text-inkmuted">Loading...</div>;
//   return (
//     <>
//       <ListView key={cfg.columns.map((c) => c.k).join('|')} cfg={cfg} />
//       <Modal
//         open={Boolean(viewing)}
//         title="Product details"
//         size="lg"
//         onClose={() => setViewing(null)}
//         footer={viewing && (
//           <>
//             <button type="button" className="btn" onClick={() => setViewing(null)}>Close</button>
//             <button type="button" className="btn btn-primary" onClick={() => router.push(editHref(viewing))}>
//               <Icon name="pencil" size={14} /> Edit
//             </button>
//           </>
//         )}
//       >
//         {viewing && <ProductView row={viewing} />}
//       </Modal>
//     </>
//   );
// }













'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ListView from '@/components/ListviewEccom';
import Modal from '@/components/Modal';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* E-commerce -> product-eccom (19-10-2026).

   A test screen over the `ecommerceproduct` collection that the separate
   e-commerce project writes (built there from barcodeLabel). Read through
   /api/product-eccom, which returns the documents exactly as stored.

   THE COLUMNS ARE THE COLLECTION'S OWN FIELDS. The page first asks the API
   which fields the documents carry (?fields=1) and makes one column per
   field, so a field added or renamed on the e-commerce side appears here
   with no change to this file. The most useful ones are put first; the rest
   follow in the order the collection has them. Column visibility hides any.

   ADD opens ./add - a form with one input per field of the collection. The
   row action opens the Item the product was made from. */

/* shown first, in this order, when the collection has them */
const FIRST = [
  'ecommItemCode', 'productType', 'isFeatured',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount',
];
const PRODUCT_LIST_FIXED_QUERY = { allErpBarcodes: '1' };

/* camelCase -> "Camel Case" */
const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isId = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));
const CLASSIFICATION_COLUMNS = new Set(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']);
const CLASSIFICATION_FILTERS = [
  ['byWeave', 'By Weave'],
  ['byFabric', 'By Fabric'],
  ['byCraft', 'By Craft'],
  ['byOccasion', 'By Occasion'],
  ['byColour', 'By Colour'],
];
const HIDDEN_COLUMNS = new Set([
  'barcodeQtyOverride', 'barcodeQualityOverride', 'barcodePriceOverride',
  'colorDescription', 'colourDescription', 'craftDescription', 'fabricDescription',
  'occasionDescription', 'printDescriptionOverride', 'weaveDescription',
  'image', 'images', 'additionalImages', 'byColour',
  'slug',
  'isPublished', 'isFeatured',
  /* per-barcode internals; the checkbox already answers visibility */
  'barcodes', 'publishedBarcodes',
  /* only Is Published decides what the website shows */
  'status', 'isActive',
]);

const selectedFiltersFor = (row) => CLASSIFICATION_FILTERS
  .map(([key, label]) => {
    const value = String(row[`${key}Display`] || '').trim();
    return value ? `${label}: ${value}` : '';
  })
  .filter(Boolean)
  .join('; ');

function columnFor({ k, type }) {
  if (k === 'barcode') return { k, t: 'Barcode', value: (r) => r.barcode || '' };
  if (k === 'ecommItemCode') return { k, t: 'E-Comm Item Code' };
  if (k === 'businessId') return { k, t: 'Business', value: (r) => r.businessName || r.businessId || '' };
  if (k === 'itemId') return { k, t: 'Item', value: (r) => r.itemLabel || r.itemId || '' };
  if (CLASSIFICATION_COLUMNS.has(k)) {
    return { k, t: labelOf(k), minWidth: 170, value: (r) => r[`${k}Display`] || '' };
  }
  const t = labelOf(k);
  if (type === 'boolean') return { k, t, f: 'yesno' };
  if (type === 'date') return { k, t, f: 'datetime' };
  if (type === 'array') {
    return {
      k, t,
      value: (r) => {
        const list = Array.isArray(r[k]) ? r[k] : [];
        if (!list.length) return '';
        if (list.every(isId)) return String(list.length);
        return list.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
      },
    };
  }
  if (type === 'text' || type === 'number' || type === 'id') {
    return { k, t, value: (r) => (r[k] && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) };
  }
  return { k, t };
}

const editHref = (r) => '/admin/ecommerce/product-eccom/add' + (r.barcode ? '?barcode=' + encodeURIComponent(r.barcode) : '');

/* The View popup: the row's saved fields, read-only. Rows already carry the display names
   (business, item, by* classifications) and the image, so nothing more is fetched. */
const VIEW_FIELDS = [
  ['Barcode', (r) => r.barcode],
  ['Product Name', (r) => r.displayName],
  ['E-Comm Item Code', (r) => r.ecommItemCode],
  ['Product Type', (r) => r.productType],
  ['Item', (r) => r.itemLabel],
  ['Business', (r) => r.businessName],
  ['Is Published', (r) => (r.isPublished ? 'Yes' : 'No')],
  ['Is Featured', (r) => (r.isFeatured ? 'Yes' : 'No')],
  ['Price', (r) => r.barcodePriceOverride],
  /* Quantity comes from the live DB (barcodeLabel.qtyNum); fall back to the
     stored override only when no live row was found */
  ['Quantity', (r) => (r.dbQty != null ? r.dbQty : r.barcodeQtyOverride)],
  ['E-Comm Off (%)', (r) => r.ecommOffPercent],
  /* Collection fields — only shown when the array is non-empty */
  ['By Weave', (r) => r.byWeaveDisplay || null],
  ['By Fabric', (r) => r.byFabricDisplay || null],
  ['By Craft', (r) => r.byCraftDisplay || null],
  ['By Occasion', (r) => r.byOccasionDisplay || null],
  ['By Colour', (r) => r.byColourDisplay || null],
  ['Selected Filters', selectedFiltersFor],
  ['Print Description', (r) => r.printDescriptionOverride],
  ['Slug', (r) => r.slug],
  ['SEO Title', (r) => r.seoTitle],
  ['SEO Description', (r) => r.seoDescription],
  ['Additional Images', (r) => (Array.isArray(r.additionalImages) ? r.additionalImages.join(', ') : r.additionalImages)],
  ['Created At', (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '')],
  ['Updated At', (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : '')],
];

function ProductView({ row }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
      <div>
        {row.barcodeImage
          ? <img src={row.barcodeImage} alt={row.displayName || row.barcode || 'Product image'} className="w-full rounded border border-line object-cover" />
          : <div className="flex h-40 items-center justify-center rounded border border-line text-[12px] text-inkmuted">No image</div>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        {VIEW_FIELDS.map(([label, get]) => {
          const value = get(row);
          /* skip fields that explicitly returned null (e.g. empty collection arrays) */
          if (value === null) return null;
          return (
            <div key={label} className="border-b border-line pb-1.5">
              <dt className="text-[11px] uppercase text-inkmuted">{label}</dt>
              <dd className="break-words text-ink">{value === undefined || value === '' ? '—' : String(value)}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function ProductEccomPage() {
  const router = useRouter();
  const { business } = useScope();
  const [fields, setFields] = useState(null);
  const [viewing, setViewing] = useState(null);
  /* Map<_id, { barcode, itemId }>: the listing row is a barcode, not the
     ecommerceproduct _id, so the barcode is what the PATCH must receive. */
  const [selectedProducts, setSelectedProducts] = useState(() => new Map());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    setSelectedProducts(new Map());
    setBulkError('');
  }, [business]);

  const enableSelectedProducts = async () => {
    const items = [...selectedProducts.values()]
      .map((entry) => ({
        barcode: String(entry?.barcode || '').trim(),
        itemId: String(entry?.itemId || '').trim(),
      }))
      .filter((entry) => entry.barcode);
    if (!business || !items.length || bulkSaving) return;
    setBulkSaving(true);
    setBulkError('');

    try {
      const response = await fetch('/api/product-eccom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, items, isPublished: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not enable selected products.');
      setSelectedProducts(new Map());
      const notes = [];
      if (result.inserted) notes.push(`${result.inserted} added to e-commerce`);
      if (result.updated) notes.push(`${result.updated} updated`);
      if (result.failed) {
        notes.push(`${result.failed} failed`);
        setBulkError(notes.join(' · ') + '.');
      } else if (result.skipped) {
        notes.push(`${result.skipped} skipped (no matching item/barcode)`);
        setBulkError(notes.join(' · ') + '.');
      } else if (notes.length) {
        setBulkError(notes.join(' · ') + '.');
      }
      setListVersion((version) => version + 1);
    } catch (error) {
      setBulkError(error.message || 'Could not enable selected products.');
    } finally {
      setBulkSaving(false);
    }
  };

  useEffect(() => {
    /* wait for the scoped business before asking the API for field metadata -
       firing with an empty business= produced an incomplete/empty field list
       on first paint, which could in turn hide columns (and the data under
       them) on the very first render after navigating here. */
    if (!business) return undefined;
    let off = false;
    setFields(null);
    fetch('/api/product-eccom?fields=1&business=' + business, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!off) setFields(Array.isArray(d.fields) ? d.fields : []); })
      .catch(() => { if (!off) setFields([]); });
    return () => { off = true; };
  }, [business]);

  const cfg = useMemo(() => {
    const list = fields || [];
    /* NOTE: only displayName is excluded here. ecommItemCode must stay in
       `visible` — it's also the first entry in FIRST/preferred below, and
       excluding it here meant that lookup returned nothing for it, so the
       column (and the data under it) silently vanished from the table via
       the final .filter(Boolean), even though the field and its data exist
       on every row. */
    const visible = list.filter((f) => f.k !== 'displayName' && !HIDDEN_COLUMNS.has(f.k));
    const preferred = ['barcode', ...FIRST, 'businessId', 'itemId'];
    const ordered = [
      ...preferred.map((k) => visible.find((f) => f.k === k)
        || (['barcode', 'businessId', 'itemId'].includes(k) ? { k, type: 'text' }
          : null)).filter(Boolean),
      ...visible.filter((f) => !preferred.includes(f.k)),
    ];
    return {
      title: 'E-commerce Products',
      basePath: '/admin/ecommerce/',
      slugPath: 'product-eccom',
      endpoint: '/api/product-eccom',
      scope: ['business'],
      fixedQuery: PRODUCT_LIST_FIXED_QUERY,
      fullExport: {
        endpoint: '/api/product-eccom',
        title: 'Ecommerce Product Export',
        fileBase: 'Ecommerce_Products',
        fastMode: true, // Skip unnecessary data enrichment
      },
      /* The Master Stock Report's filter set, applied server-side to the same
         barcode / item records these products are built from. The route reads
         these keys by name - see resolveProductFilters in /api/product-eccom. */
      headerDates: ['startDate', 'endDate'],
      filters: [
        { k: 'barcodeNo', label: 'Barcode Number', type: 'text', placeholder: 'Barcode number' },
        { k: 'groupName', label: 'Group Name', type: 'ref', ref: 'product/group', all: 'Select Group', showAllOptions: true },
        { k: 'itemId', label: 'Item Code', type: 'ref', ref: 'item-code', multi: true, all: 'Type to search', showAllOptions: true },
        { k: 'hsn', label: 'HSN', type: 'text', placeholder: 'HSN code' },
        { k: 'gst', label: 'GST %', type: 'text', placeholder: 'GST %' },

        /* Location is drawn in the filter card's scope row, from the same
           useScope().locations list the top bar uses. Empty = All Locations. */
        { k: 'locationFilter', label: 'Location', type: 'location', all: 'All Locations' },

        { k: 'city', label: 'City', type: 'city', placeholder: 'Type city', suggest: '/api/cities' },
        {
          k: 'supplierId', label: 'Supplier Name', type: 'ref', ref: 'supplier', multi: true,
          dependsOn: 'city', dependsParam: 'city', waitPlaceholder: 'Enter city first', all: 'Type to search',
        },
        { k: 'agentId', label: 'Agent', type: 'ref', ref: 'agent', multi: true, all: 'Type to search' },
        { k: 'uom', label: 'UOM', type: 'ref', ref: 'uom', all: 'All UOM' },

        { k: 'rspMin', label: 'RSP Min', type: 'text', placeholder: 'Min RSP' },
        { k: 'rspMax', label: 'RSP Max', type: 'text', placeholder: 'Max RSP' },
        { k: 'rspOfferPriceMin', label: 'RSP Offer Price Min', type: 'text', placeholder: 'Min offer price' },
        { k: 'rspOfferPriceMax', label: 'RSP Offer Price Max', type: 'text', placeholder: 'Max offer price' },
        { k: 'wspMin', label: 'WSP Min', type: 'text', placeholder: 'Min WSP' },
        { k: 'wspMax', label: 'WSP Max', type: 'text', placeholder: 'Max WSP' },
        { k: 'ecomMin', label: 'E COM Min', type: 'text', placeholder: 'Min E COM' },
        { k: 'ecomMax', label: 'E COM Max', type: 'text', placeholder: 'Max E COM' },
        { k: 'ageMin', label: 'Age Min (days)', type: 'text', placeholder: 'Min age' },
        { k: 'ageMax', label: 'Age Max (days)', type: 'text', placeholder: 'Max age' },
        { k: 'costPriceMin', label: 'Cost Price Min', type: 'text', placeholder: 'Min cost' },
        { k: 'costPriceMax', label: 'Cost Price Max', type: 'text', placeholder: 'Max cost' },
        { k: 'discount', label: 'Discount %', type: 'text', placeholder: 'Discount %' },

        { k: 'patternSupplierNo', label: 'Supplier No', type: 'text', placeholder: 'Supplier code' },
        { k: 'patternGrcNo', label: 'GRC No', type: 'text', placeholder: 'GRC number' },
        { k: 'patternSlNo', label: 'SL No', type: 'text' },
        { k: 'patternQty', label: 'Qty', type: 'text' },
        { k: 'startDate', label: 'From Date', type: 'date' },
        { k: 'endDate', label: 'To Date', type: 'date' },
      ],
      filterGroups: [
        {
          title: 'Basic Filters',
          icon: 'barcode',
          color: '#2563a9',
          cols: 5,
          fields: ['barcodeNo', 'groupName', 'itemId', 'hsn', 'gst'],
        },
        {
          title: 'Supplier & Inventory',
          icon: 'truck',
          color: '#16a34a',
          cols: 4,
          fields: ['agentId', 'city', 'supplierId', 'uom'],
        },
        {
          title: 'Price Filters',
          icon: 'calculator',
          color: '#f59e0b',
          cols: 3,
          fields: [
            { label: 'RSP', range: ['rspMin', 'rspMax'] },
            { label: 'RSP Offer Price', range: ['rspOfferPriceMin', 'rspOfferPriceMax'] },
            { label: 'WSP', range: ['wspMin', 'wspMax'] },
            { label: 'E Com', range: ['ecomMin', 'ecomMax'] },
            { label: 'Age (Days)', range: ['ageMin', 'ageMax'] },
            { label: 'Cost Price', range: ['costPriceMin', 'costPriceMax'] },
            'discount',
          ],
        },
        {
          title: 'Barcode Pattern',
          icon: 'barcode',
          color: '#7c3aed',
          cols: 4,
          fields: ['patternSupplierNo', 'patternGrcNo', 'patternSlNo', 'patternQty'],
        },
      ],
      /* ADD opens a form with every field of the collection (./add) */
      addHref: '/admin/ecommerce/product-eccom/add',
      beforeTable: selectedProducts.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-line bg-white p-3">
          <span className="mr-2 text-[13px] font-medium text-ink">
            {selectedProducts.size} product{selectedProducts.size === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={bulkSaving || !business}
            onClick={enableSelectedProducts}
          >
            {bulkSaving ? 'Saving...' : 'Show in E-commerce'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={bulkSaving}
            onClick={() => setSelectedProducts(new Map())}
          >
            Clear selection
          </button>
          {bulkError && <span className="w-full text-[12px] text-danger" role="alert">{bulkError}</span>}
        </div>
      ),
      pager: 'numbered',
      sortable: true,
      actionVariant: 'buttons',
      nowrapHead: true,
      actionMenu: [
        { label: 'View', icon: 'eye', onClick: (r) => setViewing(r) },
        {
          /* the Add form loads the saved product by its barcode and Save updates it (one per item) */
          label: 'Edit',
          icon: 'pencil',
          to: editHref,
        },
        // {
        //   label: 'Edit Item',
        //   icon: 'box',
        //   to: (r) => '/admin/inventory/item/' + r.itemId,
        // },
      ],
      columns: [
        {
          k: 'selectProduct',
          t: 'Select',
          render: (row) => (
            <input
              type="checkbox"
              checked={selectedProducts.has(row._id)}
              aria-label={`Select product ${row.barcode || row.displayName || row._id}`}
              onChange={() => {
                setSelectedProducts((current) => {
                  const next = new Map(current);
                  if (next.has(row._id)) next.delete(row._id);
                  else next.set(row._id, {
                    barcode: String(row.barcode || '').trim(),
                    itemId: String(row.itemId || '').trim(),
                  });
                  return next;
                });
              }}
            />
          ),
        },
        { k: 'barcodeImage', t: 'Images', f: 'image', value: (r) => r.barcodeImage || '' },
        ...ordered.map(columnFor),
        {
          k: 'selectedFilters',
          t: 'Selected Filters',
          minWidth: 280,
          value: selectedFiltersFor,
        },
      ],
    };
  }, [bulkError, bulkSaving, business, fields, selectedProducts]);

  if (!business) return <div className="card p-6 text-[13px] text-inkmuted">Select a Business in the top bar first.</div>;
  if (fields === null) return <div className="card p-6 text-[13px] text-inkmuted">Loading...</div>;
  return (
    <>
      <ListView key={cfg.columns.map((c) => c.k).join('|')} cfg={cfg} reloadKey={listVersion} />
      <Modal
        open={Boolean(viewing)}
        title="Product details"
        size="lg"
        onClose={() => setViewing(null)}
        footer={viewing && (
          <>
            <button type="button" className="btn" onClick={() => setViewing(null)}>Close</button>
            <button type="button" className="btn btn-primary" onClick={() => router.push(editHref(viewing))}>
              <Icon name="pencil" size={14} /> Edit
            </button>
          </>
        )}
      >
        {viewing && <ProductView row={viewing} />}
      </Modal>
    </>
  );
}
