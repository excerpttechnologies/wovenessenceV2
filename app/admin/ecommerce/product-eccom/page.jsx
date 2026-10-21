// // 'use client';
// // import { useEffect, useMemo, useState } from 'react';
// // import ListView from '@/components/ListView';
// // import { useScope } from '@/components/ScopeContext';

// // /* E-commerce -> product-eccom (19-10-2026).

// //    A test screen over the `ecommerceproduct` collection that the separate
// //    e-commerce project writes (built there from barcodeLabel). Read through
// //    /api/product-eccom, which returns the documents exactly as stored.

// //    THE COLUMNS ARE THE COLLECTION'S OWN FIELDS. The page first asks the API
// //    which fields the documents carry (?fields=1) and makes one column per
// //    field, so a field added or renamed on the e-commerce side appears here
// //    with no change to this file. The most useful ones are put first; the rest
// //    follow in the order the collection has them. Column visibility hides any.

// //    ADD opens ./add - a form with one input per field of the collection. The
// //    row action opens the Item the product was made from. */

// // /* shown first, in this order, when the collection has them */
// // const FIRST = [
// //   'displayName', 'ecommItemCode', 'productType', 'status', 'isPublished', 'isFeatured',
// //   'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount', 'slug',
// // ];

// // /* camelCase -> "Camel Case" */
// // const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
// // const isId = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));

// // function columnFor({ k, type }) {
// //   const t = labelOf(k);
// //   if (type === 'boolean') return { k, t, f: 'yesno' };
// //   if (type === 'date') return { k, t, f: 'datetime' };
// //   if (type === 'array') {
// //     /* a list of ids reads as how many; a list of words reads as the words */
// //     return {
// //       k, t,
// //       value: (r) => {
// //         const list = Array.isArray(r[k]) ? r[k] : [];
// //         if (!list.length) return '';
// //         if (list.every(isId)) return String(list.length);
// //         return list.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
// //       },
// //     };
// //   }
// //   if (type === 'text' || type === 'number' || type === 'id') {
// //     return { k, t, value: (r) => (r[k] && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) };
// //   }
// //   return { k, t };
// // }

// // export default function ProductEccomPage() {
// //   const { business } = useScope();
// //   const [fields, setFields] = useState(null);

// //   useEffect(() => {
// //     let off = false;
// //     setFields(null);
// //     fetch('/api/product-eccom?fields=1&business=' + (business || ''), { cache: 'no-store' })
// //       .then((r) => r.json())
// //       .then((d) => { if (!off) setFields(Array.isArray(d.fields) ? d.fields : []); })
// //       .catch(() => { if (!off) setFields([]); });
// //     return () => { off = true; };
// //   }, [business]);

// //   const cfg = useMemo(() => {
// //     const list = fields || [];
// //     const ordered = [
// //       ...FIRST.map((k) => list.find((f) => f.k === k)).filter(Boolean),
// //       ...list.filter((f) => !FIRST.includes(f.k)),
// //     ];
// //     return {
// //       title: 'product-eccom',
// //       basePath: '/admin/ecommerce/',
// //       slugPath: 'product-eccom',
// //       endpoint: '/api/product-eccom',
// //       scope: ['business'],
// //       /* ADD opens a form with every field of the collection (./add) */
// //       addHref: '/admin/ecommerce/product-eccom/add',
// //       pager: 'numbered',
// //       sortable: true,
// //       actionVariant: 'dropdown',
// //       actionMenu: [
// //         {
// //           label: 'View Item',
// //           icon: 'eye',
// //           to: (r) => '/admin/inventory/item/' + r.itemId,
// //         },
// //       ],
// //       columns: ordered.map(columnFor),
// //     };
// //   }, [fields]);

// //   if (fields === null) return <div className="card p-6 text-[13px] text-inkmuted">Loading...</div>;
// //   return <ListView key={cfg.columns.map((c) => c.k).join('|')} cfg={cfg} />;
// // }



// 'use client';
// import { useEffect, useMemo, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import Icon from '@/components/Icon';
// import MultiSelect from '@/components/MultiSelect';
// import ClassificationPicker from '@/components/ClassificationPicker';
// import { useScope } from '@/components/ScopeContext';
// import {
//   PRODUCT_TYPE_CLASSIFICATIONS,
//   PRODUCT_TYPES,
// } from '@/lib/productClassificationConstants';

// /* E-commerce -> product-eccom -> Add (19-10-2026).

//    One input per field of the `ecommerceproduct` collection, read from
//    /api/product-eccom?fields=1 - so a field the e-commerce project adds
//    appears here too, as a text box until it is given a type below.

//      itemId        the item the product is for (one product per item)
//      by*           tick boxes of the business's classification options
//      flags         check boxes
//      numbers       number inputs
//      descriptions  text areas; additionalImages one URL per line
//      businessId    the company in the top bar; createdAt / updatedAt are set
//                    by the server */

// const KNOWN = {
//   displayName: 'text', ecommItemCode: 'text', productType: 'text', status: 'text', slug: 'text',
//   isActive: 'boolean', isPublished: 'boolean', isFeatured: 'boolean',
//   ecommOffPercent: 'number', barcodePriceOverride: 'number', barcodeQtyOverride: 'number', salesCount: 'number',
//   barcodeStatusOverride: 'text', printDescriptionOverride: 'text', image: 'text',
//   seoTitle: 'text', seoDescription: 'textarea',
//   colourDescription: 'textarea', craftDescription: 'textarea', fabricDescription: 'textarea',
//   occasionDescription: 'textarea', weaveDescription: 'textarea',
//   additionalImages: 'lines',
//   byColour: 'classification', byCraft: 'classification', byFabric: 'classification',
//   byOccasion: 'classification', byWeave: 'classification',
// };
// const FIRST = [
//   'printDescriptionOverride',
//   'displayName', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
//   'status', 'isActive', 'ecommItemCode', 'itemId',
//   'slug', 'isPublished', 'isFeatured', 'salesCount',
// ];
// const CLASSIFICATION_FIELDS = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];
// const SKIP = new Set([
//   'businessId', 'createdAt', 'updatedAt', 'seoDescription',
//   'barcodeStatusOverride', 'image', 'seoTitle',
//   'colourDescription', 'craftDescription', 'fabricDescription',
//   'occasionDescription', 'weaveDescription',
//   'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride',
// ]);

// const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
// const fieldLabel = (k) => ({
//   ecommOffPercent: 'E-Comm Off (%)',
//   barcodePriceOverride: 'Price',
//   barcodeQtyOverride: 'Quantity',
//   printDescriptionOverride: 'Print Description',
//   displayName: 'Product Name',
//   status: 'Active Status',
// }[k] || labelOf(k));
// const classificationsFor = (type) => {
//   const normalized = String(type || '').trim().toUpperCase();
//   const canonical = normalized === 'SAREE' ? 'SAREES'
//     : normalized === 'FABRIC' ? 'FABRICS'
//       : normalized;
//   return PRODUCT_TYPE_CLASSIFICATIONS[canonical] || [];
// };
// const kindOf = (f) => (f.k === 'itemId' ? 'item' : KNOWN[f.k] || (f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : f.type === 'array' ? 'lines' : 'text'));

// export default function ProductEccomAddPage() {
//   const router = useRouter();
//   const { business } = useScope();
//   const [fields, setFields] = useState(null);
//   const [items, setItems] = useState([]);
//   const [productTypes, setProductTypes] = useState(PRODUCT_TYPES);
//   const [data, setData] = useState({ status: 'active', isActive: true, isPublished: false, isFeatured: false });
//   const [barcodeInput, setBarcodeInput] = useState('');
//   const [itemDetails, setItemDetails] = useState(null);
//   const [barcodeLoading, setBarcodeLoading] = useState(false);
//   const [barcodeError, setBarcodeError] = useState('');
//   const [errors, setErrors] = useState({});
//   const [error, setError] = useState('');
//   const [saving, setSaving] = useState(false);

//   useEffect(() => {
//     if (!business) return undefined;
//     let off = false;
//     const q = 'business=' + business;
//     Promise.all([
//       fetch('/api/product-eccom?fields=1&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
//       fetch('/api/options?ref=item&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
//       fetch('/api/v1/admin/product-types?business=' + encodeURIComponent(business), { cache: 'no-store' })
//         .then((r) => r.ok ? r.json() : Promise.reject(new Error('Unable to load product types')))
//         .catch((e) => { console.error('Failed to load product types:', e); return {}; }),
//     ]).then(([f, it, pt]) => {
//       if (off) return;
//       /* the known fields always, plus whatever else the collection carries */
//       const seen = (f.fields || []).filter((x) => !SKIP.has(x.k));
//       const all = [...seen];
//       ['itemId', ...Object.keys(KNOWN)].forEach((k) => {
//         if (!SKIP.has(k) && !all.some((x) => x.k === k)) all.push({ k, type: 'text' });
//       });
//       setFields(all);
//       setItems((it.options || []).map((o) => ({ ...o, value: String(o.value) })));
//       setProductTypes(Array.isArray(pt.types) && pt.types.length ? pt.types : PRODUCT_TYPES);
//     });
//     return () => { off = true; };
//   }, [business]);

//   useEffect(() => {
//     const barcode = barcodeInput.trim();
//     if (!barcode || !business) {
//       setBarcodeLoading(false);
//       setBarcodeError('');
//       return undefined;
//     }

//     const controller = new AbortController();
//     const timer = setTimeout(async () => {
//       setBarcodeLoading(true);
//       setBarcodeError('');
//       try {
//         const query = new URLSearchParams({ barcodeLookup: barcode, business });
//         const response = await fetch(`/api/product-eccom?${query}`, {
//           cache: 'no-store',
//           signal: controller.signal,
//         });
//         const result = await response.json();
//         if (!response.ok) throw new Error(result.error || 'Could not look up this barcode.');

//         setItemDetails(result.item);
//         setData((current) => ({
//           ...current,
//           ...Object.fromEntries(Object.entries(result.data || {}).filter(([key]) =>
//             !['_id', '__v', 'businessId', 'createdAt', 'updatedAt'].includes(key))),
//           itemId: result.item.id,
//         }));
//         setItems((current) => current.some((item) => item.value === result.item.id)
//           ? current
//           : [...current, {
//             value: result.item.id,
//             label: [result.item.itemCode, result.item.name].filter(Boolean).join(' - '),
//           }]);
//         setErrors((current) => ({ ...current, itemId: '' }));
//       } catch (lookupError) {
//         if (lookupError.name !== 'AbortError') {
//           setItemDetails(null);
//           setBarcodeError(lookupError.message || 'Could not look up this barcode.');
//         }
//       } finally {
//         if (!controller.signal.aborted) setBarcodeLoading(false);
//       }
//     }, 450);

//     return () => {
//       clearTimeout(timer);
//       controller.abort();
//     };
//   }, [barcodeInput, business]);

//   const ordered = useMemo(() => {
//     const applicableClassifications = classificationsFor(data.productType);
//     const list = (fields || []).filter((field) =>
//       !CLASSIFICATION_FIELDS.includes(field.k) || applicableClassifications.includes(field.k));
//     return [...FIRST.map((k) => list.find((f) => f.k === k)).filter(Boolean), ...list.filter((f) => !FIRST.includes(f.k))];
//   }, [fields, data.productType]);

//   const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

//   /* picking the item fills Display Name and Ecomm Item Code when still empty */
//   const pickItem = (v) => {
//     const it = items.find((o) => o.value === v);
//     setBarcodeInput('');
//     setItemDetails(null);
//     setBarcodeError('');
//     setData((d) => ({
//       ...d,
//       itemId: v,
//       displayName: d.displayName || it?.name || it?.label || '',
//       ecommItemCode: d.ecommItemCode || it?.code || '',
//     }));
//     setErrors((e) => ({ ...e, itemId: '' }));
//   };

//   async function save() {
//     setSaving(true);
//     setError('');
//     try {
//       const r = await fetch('/api/product-eccom', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           business,
//           data: {
//             ...data,
//             ...(barcodeInput.trim() ? { barcode: barcodeInput.trim() } : {}),
//           },
//         }),
//       });
//       const d = await r.json().catch(() => ({}));
//       if (!r.ok) {
//         setErrors(d.errors || {});
//         setError(d.error || 'Could not save.');
//         return;
//       }
//       window.location.assign('/admin/ecommerce/product-eccom');
//     } catch {
//       setError('Could not reach the server.');
//     } finally {
//       setSaving(false);
//     }
//   }

//   const input = (f) => {
//     const k = f.k;
//     const kind = kindOf(f);
//     const v = data[k];
//     if (kind === 'item') {
//       return <MultiSelect mode="single" options={items} value={v || ''} placeholder="Select item" onChange={pickItem} />;
//     }
//     if (k === 'productType') {
//       const options = [...productTypes];
//       if (v && !options.some((option) => option.value === v)) options.push({ value: v, label: v });
//       return (
//         <select className="f-input" value={v || ''} onChange={(event) => set(k, event.target.value)}>
//           {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
//         </select>
//       );
//     }
//     if (kind === 'boolean') {
//       if (k === 'isActive') {
//         return (
//           <label className="flex h-[38px] cursor-pointer items-center gap-2">
//             <span className="relative inline-flex">
//               <input
//                 type="checkbox"
//                 className="peer sr-only"
//                 checked={v !== false}
//                 onChange={(e) => set(k, e.target.checked)}
//                 aria-label="Is Active"
//               />
//               <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600" />
//               <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
//             </span>
//             <span className="text-[13px] font-medium text-ink">Is Active</span>
//             <span className="text-[12px] text-inkmuted">{v !== false ? 'Active' : 'Inactive'}</span>
//           </label>
//         );
//       }
//       return (
//         <label className="flex h-[38px] cursor-pointer items-center gap-2">
//           <input type="checkbox" className="h-4 w-4" checked={Boolean(v)} onChange={(e) => set(k, e.target.checked)} /> {labelOf(k)}
//         </label>
//       );
//     }
//     if (kind === 'number') {
//       return <input className="f-input" type="number" value={v ?? ''} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => set(k, e.target.value)} />;
//     }
//     if (kind === 'textarea') {
//       return <textarea className="f-input min-h-[70px]" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
//     }
//     if (kind === 'lines') {
//       return <textarea className="f-input min-h-[70px]" placeholder="One per line" value={Array.isArray(v) ? v.join('\n') : (v ?? '')} onChange={(e) => set(k, e.target.value.split('\n'))} />;
//     }
//     if (kind === 'classification') {
//       return (
//         <ClassificationPicker
//           type={k}
//           value={Array.isArray(v) ? v.map(String) : []}
//           onChange={(value) => set(k, value)}
//           businessId={business}
//         />
//       );
//     }
//     return <input className="f-input" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
//   };

//   const wide = (f) => ['textarea', 'lines', 'classification'].includes(kindOf(f));

//   return (
//     <div className="card">
//       <div className="card-head">
//         <span className="card-title">Add product-eccom</span>
//         <span className="flex-1" />
//         <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/ecommerce/product-eccom')}>
//           <Icon name="x" size={14} /> Cancel
//         </button>
//       </div>
//       <div className="card-body">
//         {!business && <div className="flash flash-err">Select a Business in the top bar first.</div>}
//         {business && fields === null && <div className="py-6 text-center text-[13px] text-inkmuted">Loading...</div>}
//         {error && <div className="flash flash-err mb-3">{error}</div>}
//         {business && fields && (
//           <>
//             <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
//               <div>
//                 <label className="f-label">Barcode</label>
//                 <input
//                   className="f-input"
//                   value={barcodeInput}
//                   placeholder="Scan or enter barcode"
//                   onChange={(event) => {
//                     setBarcodeInput(event.target.value);
//                     setItemDetails(null);
//                     setBarcodeError('');
//                     setData({
//                       status: 'active',
//                       isActive: true,
//                       isPublished: false,
//                       isFeatured: false,
//                     });
//                   }}
//                 />
//                 {barcodeLoading && <div className="mt-0.5 text-[12px] text-inkmuted">Looking up barcode...</div>}
//                 {barcodeError && <div className="mt-0.5 text-[12px] text-danger">{barcodeError}</div>}
//               </div>
//               <div>
//                 <label className="f-label">Item Code</label>
//                 <input className="f-input" value={itemDetails?.itemCode || ''} readOnly />
//               </div>
//               <div>
//                 <label className="f-label">Group</label>
//                 <input className="f-input" value={itemDetails?.group || ''} readOnly />
//               </div>
//               <div>
//                 <label className="f-label">E-Comm Off (%)</label>
//                 <input
//                   className="f-input"
//                   type="number"
//                   value={data.ecommOffPercent ?? ''}
//                   onWheel={(event) => event.currentTarget.blur()}
//                   onChange={(event) => set('ecommOffPercent', event.target.value)}
//                 />
//               </div>
//               <div>
//                 <label className="f-label">Price</label>
//                 <input
//                   className="f-input"
//                   type="number"
//                   value={data.barcodePriceOverride ?? ''}
//                   onWheel={(event) => event.currentTarget.blur()}
//                   onChange={(event) => set('barcodePriceOverride', event.target.value)}
//                 />
//               </div>
//               <div>
//                 <label className="f-label">HSN Code</label>
//                 <input className="f-input" value={itemDetails?.hsnCode || ''} readOnly />
//               </div>
//               <div>
//                 <label className="f-label">Quantity</label>
//                 <input
//                   className="f-input"
//                   type="number"
//                   value={data.barcodeQtyOverride ?? ''}
//                   onWheel={(event) => event.currentTarget.blur()}
//                   onChange={(event) => set('barcodeQtyOverride', event.target.value)}
//                 />
//               </div>
//             </div>
//             <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
//               {ordered.map((f) => (
//                 <div key={f.k} className={wide(f) ? 'md:col-span-3' : undefined}>
//                   {kindOf(f) !== 'boolean' && kindOf(f) !== 'classification' && (
//                     <label className="f-label">
//                       {f.k === 'itemId' ? 'Item' : fieldLabel(f.k)}
//                       {(f.k === 'itemId' || f.k === 'displayName') && <span className="text-danger"> *</span>}
//                     </label>
//                   )}
//                   {input(f)}
//                   {errors[f.k] && <div className="mt-0.5 text-[12px] text-danger">{errors[f.k]}</div>}
//                 </div>
//               ))}
//             </div>
//             <div className="mt-4 flex justify-end gap-2">
//               <button type="button" className="btn" onClick={() => router.push('/admin/ecommerce/product-eccom')}>Cancel</button>
//               <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
//                 {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save
//               </button>
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }









'use client';
import { useEffect, useMemo, useState } from 'react';
import ListView from '@/components/ListviewEccom';
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
  'ecommItemCode', 'productType', 'status', 'isActive', 'isPublished', 'isFeatured',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount', 'slug',
];

/* camelCase -> "Camel Case" */
const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isId = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));
const CLASSIFICATION_COLUMNS = new Set(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']);

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

export default function ProductEccomPage() {
  const { business } = useScope();
  const [fields, setFields] = useState(null);

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
    const visible = list.filter((f) => f.k !== 'displayName');
    const preferred = ['barcode', ...FIRST, 'businessId', 'itemId'];
    const ordered = [
      ...preferred.map((k) => visible.find((f) => f.k === k)
        || (['barcode', 'businessId', 'itemId'].includes(k) ? { k, type: 'text' }
          : k === 'isActive' ? { k, type: 'boolean' } : null)).filter(Boolean),
      ...visible.filter((f) => !preferred.includes(f.k)),
    ];
    return {
      title: 'product-eccom',
      basePath: '/admin/ecommerce/',
      slugPath: 'product-eccom',
      endpoint: '/api/product-eccom',
      scope: ['business'],
      /* ADD opens a form with every field of the collection (./add) */
      addHref: '/admin/ecommerce/product-eccom/add',
      pager: 'numbered',
      sortable: true,
      actionVariant: 'dropdown',
      actionMenu: [
        {
          label: 'Edit Item',
          icon: 'pencil',
          to: (r) => '/admin/inventory/item/' + r.itemId,
        },
      ],
      columns: [
        { k: 'barcodeImage', t: 'Images', f: 'image', value: (r) => r.barcodeImage || '' },
        ...ordered.map(columnFor),
      ],
    };
  }, [fields]);

  if (!business) return <div className="card p-6 text-[13px] text-inkmuted">Select a Business in the top bar first.</div>;
  if (fields === null) return <div className="card p-6 text-[13px] text-inkmuted">Loading...</div>;
  return <ListView key={cfg.columns.map((c) => c.k).join('|')} cfg={cfg} />;
}
