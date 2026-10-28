// 'use client';
// import { useEffect, useMemo, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import Icon from '@/components/Icon';
// import MultiSelect from '@/components/MultiSelect';
// import ClassificationPicker from '@/components/ClassificationPicker';
// import { useScope } from '@/components/ScopeContext';
// import {
//   DUPATTA_FABRIC_OPTIONS,
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
//   'displayName', 'image', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
//   'status', 'isActive', 'ecommItemCode', 'itemId',
//   'slug', 'isPublished', 'isFeatured', 'salesCount',
// ];
// const SKIP = new Set([
//   /* only Is Published decides what the website shows; Active is not edited here
//      (DEFAULT_DATA still saves status 'active' / isActive true for other screens) */
//   'status', 'isActive',
//   'businessId', 'createdAt', 'updatedAt', 'seoDescription', 'barcode',
//   'barcodeStatusOverride', 'seoTitle',
//   'colourDescription', 'craftDescription', 'fabricDescription',
//   'occasionDescription', 'weaveDescription',
//   'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride',
// ]);

// const DEFAULT_DATA = { status: 'active', isActive: true, isPublished: false, isFeatured: false };

// const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
// const fieldLabel = (k) => ({
//   ecommOffPercent: 'E-Comm Off (%)',
//   barcodePriceOverride: 'Price',
//   barcodeQtyOverride: 'Quantity',
//   printDescriptionOverride: 'Print Description',
//   displayName: 'Product Name',
//   status: 'Active Status',
// }[k] || labelOf(k));
// const kindOf = (f) => (f.k === 'itemId' ? 'item' : KNOWN[f.k] || (f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : f.type === 'array' ? 'lines' : 'text'));

// export default function ProductEccomAddPage() {
//   const router = useRouter();
//   const { business } = useScope();
//   const [fields, setFields] = useState(null);
//   const [items, setItems] = useState([]);
//   const [productTypes, setProductTypes] = useState(PRODUCT_TYPES);
//   const [data, setData] = useState(DEFAULT_DATA);
//   const [barcodeInput, setBarcodeInput] = useState('');
//   /* opened from the list's Edit action: ?barcode= loads that saved product into the form */
//   const [isEdit, setIsEdit] = useState(false);
//   useEffect(() => {
//     const barcode = new URLSearchParams(window.location.search).get('barcode')?.trim();
//     if (barcode) {
//       setIsEdit(true);
//       setBarcodeInput(barcode);
//     }
//   }, []);
//   const [barcodeOptions, setBarcodeOptions] = useState([]);
//   const [barcodeOptionsLoading, setBarcodeOptionsLoading] = useState(false);
//   const [barcodeOptionsError, setBarcodeOptionsError] = useState('');
//   const [barcodePickerOpen, setBarcodePickerOpen] = useState(false);
//   const [itemDetails, setItemDetails] = useState(null);
//   /* the barcode exactly as the ERP stores it (case included); saved instead of what was typed */
//   const [resolvedBarcode, setResolvedBarcode] = useState('');
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
//     if (!barcodePickerOpen || !business) {
//       setBarcodeOptions([]);
//       setBarcodeOptionsError('');
//       return undefined;
//     }

//     const controller = new AbortController();
//     const timer = setTimeout(async () => {
//       setBarcodeOptionsLoading(true);
//       setBarcodeOptionsError('');
//       try {
//         const query = new URLSearchParams({
//           barcodeOptions: '1',
//           business,
//           search: barcodeInput.trim(),
//         });
//         const response = await fetch(`/api/product-eccom?${query}`, {
//           cache: 'no-store',
//           signal: controller.signal,
//         });
//         const result = await response.json();
//         if (!response.ok) throw new Error(result.error || 'Could not load barcodes.');
//         setBarcodeOptions(Array.isArray(result.options) ? result.options : []);
//       } catch (optionsError) {
//         if (optionsError.name !== 'AbortError') {
//           setBarcodeOptionsError(optionsError.message || 'Could not load barcodes.');
//         }
//       } finally {
//         if (!controller.signal.aborted) setBarcodeOptionsLoading(false);
//       }
//     }, 200);

//     return () => {
//       clearTimeout(timer);
//       controller.abort();
//     };
//   }, [barcodePickerOpen, barcodeInput, business]);

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
//         setResolvedBarcode(result.barcodeNo || result.barcode || '');
//         setBarcodePickerOpen(false);
//         /* start from the defaults, not the previous product: values such as an old
//            `barcodes` list must not carry over onto the barcode just looked up */
//         setData(() => ({
//           ...DEFAULT_DATA,
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
//     const list = fields || [];
//     const productType = String(data.productType || '').trim().toUpperCase();
//     const applicableClassifications = PRODUCT_TYPE_CLASSIFICATIONS[productType];
//     return [
//       ...FIRST.map((k) => list.find((f) => f.k === k)).filter((field) =>
//         field && (kindOf(field) !== 'classification'
//           || !applicableClassifications
//           || applicableClassifications.includes(field.k))
//       ),
//       ...list.filter((field) =>
//         !FIRST.includes(field.k)
//         && (kindOf(field) !== 'classification'
//           || !applicableClassifications
//           || applicableClassifications.includes(field.k))
//       ),
//     ];
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

//   /* Typing/clearing in the Barcode box used to reset the WHOLE form on every
//      keystroke (setData({...4 defaults})), which wiped itemId/displayName
//      (both required) if you so much as corrected a character after a lookup
//      had already filled them in — Save would then fail or save a near-empty
//      row. We now only reset the form when a fresh barcode is being started
//      (box was empty, user just typed the first character), which is the one
//      moment a full reset is actually wanted. Clearing the box back to empty
//      also resets, since that's "I'm starting over", but editing mid-barcode
//      no longer touches the rest of the form. */
//   const onBarcodeChange = (event) => {
//     const value = event.target.value;
//     const wasEmpty = barcodeInput.trim() === '';
//     const isEmptyNow = value.trim() === '';
//     setBarcodeInput(value);
//     setItemDetails(null);
//     setResolvedBarcode('');
//     setBarcodeError('');
//     if ((wasEmpty && !isEmptyNow) || isEmptyNow) {
//       setData(DEFAULT_DATA);
//     }
//   };

//   const selectBarcode = (option) => {
//     setBarcodeInput(option.value);
//     setItemDetails(null);
//     setResolvedBarcode('');
//     setBarcodeError('');
//     setBarcodeOptions([]);
//     setBarcodePickerOpen(false);
//     setData(DEFAULT_DATA);
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
//             ...((resolvedBarcode || barcodeInput.trim()) ? { barcode: resolvedBarcode || barcodeInput.trim() } : {}),
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
//     if (k === 'image') {
//       return (
//         <div>
//           {v && (
//             <img src={v} alt="Product image from barcode" className="h-16 w-16 rounded border border-line object-cover" />
//           )}
//           {!v && <div className="text-[12px] text-inkmuted">No image available for this barcode.</div>}
//         </div>
//       );
//     }
//     if (kind === 'item') {
//       return <MultiSelect mode="single" options={items} value={v || ''} placeholder="Select item" onChange={pickItem} />;
//     }
//     if (k === 'productType') {
//       const options = [...productTypes];
//       if (v && !options.some((option) => option.value === v)) options.push({ value: v, label: v });
//       /* a barcode lookup sets the type from the item's group: lock it then. Left editable when the
//          lookup found no real type (empty, or an item type such as "Simple"), so one can be chosen. */
//       const locked = Boolean(itemDetails && v && productTypes.some((option) => option.value && option.value === v));
//       return (
//         <select
//           className={`f-input${locked ? ' cursor-not-allowed bg-slate-100' : ''}`}
//           value={v || ''}
//           disabled={locked}
//           title={locked ? 'Set from the barcode\'s item group' : undefined}
//           onChange={(event) => set(k, event.target.value)}
//         >
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
//       const productType = String(data.productType || '').trim().toUpperCase();
//       const isPlainFabric = productType === 'PLAIN FABRICS';
//       const isFabric = productType === 'FABRICS';
//       return (
//         <ClassificationPicker
//           type={k}
//           value={Array.isArray(v) ? v.map(String) : []}
//           onChange={(value) => set(k, value)}
//           businessId={business}
//           productType={isPlainFabric || isFabric ? productType : undefined}
//           allowCreate={!(
//             (k === 'byFabric' && productType === 'DUPATTA')
//             || ((isPlainFabric || isFabric) && ['byFabric', 'byColour'].includes(k))
//           )}
//           optionsOverride={k === 'byFabric' && String(data.productType || '').trim().toUpperCase() === 'DUPATTA'
//             ? DUPATTA_FABRIC_OPTIONS.map((name) => ({ _id: name, name }))
//             : undefined}
//         />
//       );
//     }
//     return <input className="f-input" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
//   };

//   const wide = (f) => ['textarea', 'lines', 'classification'].includes(kindOf(f));

//   return (
//     <div className="card">
//       <div className="card-head">
//         <span className="card-title">{isEdit ? 'Edit product-eccom' : 'Add product-eccom'}</span>
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
//                 <div className="relative">
//                   <input
//                     className="f-input"
//                     value={barcodeInput}
//                     placeholder="Search, scan or enter barcode"
//                     onFocus={() => setBarcodePickerOpen(true)}
//                     onBlur={() => setTimeout(() => setBarcodePickerOpen(false), 150)}
//                     onChange={onBarcodeChange}
//                     role="combobox"
//                     aria-autocomplete="list"
//                     aria-expanded={barcodePickerOpen}
//                   />
//                   {barcodePickerOpen && (
//                     <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-pop">
//                       {barcodeOptionsLoading ? (
//                         <div className="px-3 py-2 text-[12px] text-inkmuted">Searching barcodes...</div>
//                       ) : barcodeOptionsError ? (
//                         <div className="px-3 py-2 text-[12px] text-danger" role="alert">{barcodeOptionsError}</div>
//                       ) : barcodeOptions.length ? (
//                         barcodeOptions.map((option) => (
//                           <button
//                             key={option.value}
//                             type="button"
//                             className="block w-full border-b border-line px-3 py-2 text-left text-[12px] text-ink hover:bg-slate-50"
//                             onMouseDown={(event) => event.preventDefault()}
//                             onClick={() => selectBarcode(option)}
//                           >
//                             {option.label}
//                           </button>
//                         ))
//                       ) : (
//                         <div className="px-3 py-2 text-[12px] text-inkmuted">
//                           {barcodeInput.trim() ? 'No matching barcodes.' : 'No barcodes found for this business.'}
//                         </div>
//                       )}
//                     </div>
//                   )}
//                 </div>
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
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import ClassificationPicker from '@/components/ClassificationPicker';
import { useScope } from '@/components/ScopeContext';
import {
  DUPATTA_FABRIC_OPTIONS,
  PRODUCT_TYPE_CLASSIFICATIONS,
  PRODUCT_TYPES,
} from '@/lib/productClassificationConstants';

/* E-commerce -> product-eccom -> Add (19-10-2026).

   One input per field of the `ecommerceproduct` collection, read from
   /api/product-eccom?fields=1 - so a field the e-commerce project adds
   appears here too, as a text box until it is given a type below.

     itemId        the item the product is for (one product per item)
     by*           tick boxes of the business's classification options
     flags         check boxes
     numbers       number inputs
     descriptions  text areas; additionalImages one URL per line
     businessId    the company in the top bar; createdAt / updatedAt are set
                   by the server */

const KNOWN = {
  displayName: 'text', ecommItemCode: 'text', productType: 'text', status: 'text', slug: 'text',
  isActive: 'boolean', isPublished: 'boolean', isFeatured: 'boolean',
  ecommOffPercent: 'number', barcodePriceOverride: 'number', barcodeQtyOverride: 'number', salesCount: 'number',
  barcodeStatusOverride: 'text', printDescriptionOverride: 'text', image: 'text',
  seoTitle: 'text', seoDescription: 'textarea',
  colourDescription: 'textarea', craftDescription: 'textarea', fabricDescription: 'textarea',
  occasionDescription: 'textarea', weaveDescription: 'textarea',
  additionalImages: 'lines',
  byColour: 'classification', byCraft: 'classification', byFabric: 'classification',
  byOccasion: 'classification', byWeave: 'classification',
};
const FIRST = [
  'printDescriptionOverride',
  'displayName', 'image', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
  'status', 'isActive', 'ecommItemCode', 'itemId',
  'slug', 'isPublished', 'isFeatured', 'salesCount',
];
const SKIP = new Set([
  /* only Is Published decides what the website shows; Active is not edited here
     (DEFAULT_DATA still saves status 'active' / isActive true for other screens) */
  'status',
  'businessId', 'createdAt', 'updatedAt', 'seoDescription', 'barcode',
  'barcodeStatusOverride', 'seoTitle',
  'slug', 'isFeatured',
  'colourDescription', 'craftDescription', 'fabricDescription',
  'occasionDescription', 'weaveDescription',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride',
]);

const DEFAULT_DATA = { status: 'active', isActive: true, isPublished: false, isFeatured: false };

const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const fieldLabel = (k) => ({
  ecommOffPercent: 'E-Comm Off (%)',
  barcodePriceOverride: 'Price',
  barcodeQtyOverride: 'Quantity',
  printDescriptionOverride: 'Print Description',
  displayName: 'Product Name',
  status: 'Active Status',
}[k] || labelOf(k));
const kindOf = (f) => (f.k === 'itemId' ? 'item' : KNOWN[f.k] || (f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : f.type === 'array' ? 'lines' : 'text'));

export default function ProductEccomAddPage() {
  const router = useRouter();
  const { business } = useScope();
  const [fields, setFields] = useState(null);
  const [items, setItems] = useState([]);
  const [productTypes, setProductTypes] = useState(PRODUCT_TYPES);
  const [data, setData] = useState(DEFAULT_DATA);
  const [barcodeInput, setBarcodeInput] = useState('');
  /* opened from the list's Edit action: ?barcode= loads that saved product into the form */
  const [isEdit, setIsEdit] = useState(false);
  useEffect(() => {
    const barcode = new URLSearchParams(window.location.search).get('barcode')?.trim();
    if (barcode) {
      setIsEdit(true);
      setBarcodeInput(barcode);
    }
  }, []);
  const [barcodeOptions, setBarcodeOptions] = useState([]);
  const [barcodeOptionsLoading, setBarcodeOptionsLoading] = useState(false);
  const [barcodeOptionsError, setBarcodeOptionsError] = useState('');
  const [barcodePickerOpen, setBarcodePickerOpen] = useState(false);
  const [itemDetails, setItemDetails] = useState(null);
  /* the barcode exactly as the ERP stores it (case included); saved instead of what was typed */
  const [resolvedBarcode, setResolvedBarcode] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageHovered, setImageHovered] = useState(false);

  useEffect(() => {
    if (!business) return undefined;
    let off = false;
    const q = 'business=' + business;
    Promise.all([
      fetch('/api/product-eccom?fields=1&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/options?ref=item&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/v1/admin/product-types?business=' + encodeURIComponent(business), { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error('Unable to load product types')))
        .catch((e) => { console.error('Failed to load product types:', e); return {}; }),
    ]).then(([f, it, pt]) => {
      if (off) return;
      /* the known fields always, plus whatever else the collection carries */
      const seen = (f.fields || []).filter((x) => !SKIP.has(x.k));
      const all = [...seen];
      ['itemId', ...Object.keys(KNOWN)].forEach((k) => {
        if (!SKIP.has(k) && !all.some((x) => x.k === k)) all.push({ k, type: 'text' });
      });
      setFields(all);
      setItems((it.options || []).map((o) => ({ ...o, value: String(o.value) })));
      setProductTypes(Array.isArray(pt.types) && pt.types.length ? pt.types : PRODUCT_TYPES);
    });
    return () => { off = true; };
  }, [business]);

  useEffect(() => {
    if (!barcodePickerOpen || !business) {
      setBarcodeOptions([]);
      setBarcodeOptionsError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBarcodeOptionsLoading(true);
      setBarcodeOptionsError('');
      try {
        const query = new URLSearchParams({
          barcodeOptions: '1',
          business,
          search: barcodeInput.trim(),
        });
        const response = await fetch(`/api/product-eccom?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load barcodes.');
        setBarcodeOptions(Array.isArray(result.options) ? result.options : []);
      } catch (optionsError) {
        if (optionsError.name !== 'AbortError') {
          setBarcodeOptionsError(optionsError.message || 'Could not load barcodes.');
        }
      } finally {
        if (!controller.signal.aborted) setBarcodeOptionsLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [barcodePickerOpen, barcodeInput, business]);

  useEffect(() => {
    const barcode = barcodeInput.trim();
    if (!barcode || !business) {
      setBarcodeLoading(false);
      setBarcodeError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBarcodeLoading(true);
      setBarcodeError('');
      try {
        const query = new URLSearchParams({ barcodeLookup: barcode, business });
        const response = await fetch(`/api/product-eccom?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not look up this barcode.');

        setItemDetails(result.item);
        setResolvedBarcode(result.barcodeNo || result.barcode || '');
        setBarcodePickerOpen(false);
        /* start from the defaults, not the previous product: values such as an old
           `barcodes` list must not carry over onto the barcode just looked up */
        setData(() => ({
          ...DEFAULT_DATA,
          ...Object.fromEntries(Object.entries(result.data || {}).filter(([key]) =>
            !['_id', '__v', 'businessId', 'createdAt', 'updatedAt'].includes(key))),
          itemId: result.item.id,
        }));
        setItems((current) => current.some((item) => item.value === result.item.id)
          ? current
          : [...current, {
            value: result.item.id,
            label: [result.item.itemCode, result.item.name].filter(Boolean).join(' - '),
          }]);
        setErrors((current) => ({ ...current, itemId: '' }));
      } catch (lookupError) {
        if (lookupError.name !== 'AbortError') {
          setItemDetails(null);
          setBarcodeError(lookupError.message || 'Could not look up this barcode.');
        }
      } finally {
        if (!controller.signal.aborted) setBarcodeLoading(false);
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [barcodeInput, business]);

  const ordered = useMemo(() => {
    const list = fields || [];
    const productType = String(data.productType || '').trim().toUpperCase();
    const applicableClassifications = PRODUCT_TYPE_CLASSIFICATIONS[productType];
    return [
      ...FIRST.map((k) => list.find((f) => f.k === k)).filter((field) =>
        field && (kindOf(field) !== 'classification'
          || !applicableClassifications
          || applicableClassifications.includes(field.k))
      ),
      ...list.filter((field) =>
        !FIRST.includes(field.k)
        && (kindOf(field) !== 'classification'
          || !applicableClassifications
          || applicableClassifications.includes(field.k))
      ),
    ];
  }, [fields, data.productType]);

  const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  /* picking the item fills Display Name and Ecomm Item Code when still empty */
  const pickItem = (v) => {
    const it = items.find((o) => o.value === v);
    setBarcodeInput('');
    setItemDetails(null);
    setBarcodeError('');
    setData((d) => ({
      ...d,
      itemId: v,
      displayName: d.displayName || it?.name || it?.label || '',
      ecommItemCode: d.ecommItemCode || it?.code || '',
    }));
    setErrors((e) => ({ ...e, itemId: '' }));
  };

  /* Typing/clearing in the Barcode box used to reset the WHOLE form on every
     keystroke (setData({...4 defaults})), which wiped itemId/displayName
     (both required) if you so much as corrected a character after a lookup
     had already filled them in — Save would then fail or save a near-empty
     row. We now only reset the form when a fresh barcode is being started
     (box was empty, user just typed the first character), which is the one
     moment a full reset is actually wanted. Clearing the box back to empty
     also resets, since that's "I'm starting over", but editing mid-barcode
     no longer touches the rest of the form. */
  const onBarcodeChange = (event) => {
    const value = event.target.value;
    const wasEmpty = barcodeInput.trim() === '';
    const isEmptyNow = value.trim() === '';
    setBarcodeInput(value);
    setItemDetails(null);
    setResolvedBarcode('');
    setBarcodeError('');
    if ((wasEmpty && !isEmptyNow) || isEmptyNow) {
      setData(DEFAULT_DATA);
    }
  };

  const selectBarcode = (option) => {
    setBarcodeInput(option.value);
    setItemDetails(null);
    setResolvedBarcode('');
    setBarcodeError('');
    setBarcodeOptions([]);
    setBarcodePickerOpen(false);
    setData(DEFAULT_DATA);
  };

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/product-eccom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business,
          data: {
            ...data,
            ...((resolvedBarcode || barcodeInput.trim()) ? { barcode: resolvedBarcode || barcodeInput.trim() } : {}),
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrors(d.errors || {});
        setError(d.error || 'Could not save.');
        return;
      }
      window.location.assign('/admin/ecommerce/product-eccom');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const input = (f) => {
    const k = f.k;
    const kind = kindOf(f);
    const v = data[k];
    if (k === 'image') {
      return (
        <div>
          {v && (
            <img
              src={v}
              alt="Product image from barcode"
              className="h-48 w-80 max-w-full cursor-zoom-in rounded border border-line object-cover"
              onMouseEnter={() => setImageHovered(true)}
              onMouseLeave={() => setImageHovered(false)}
              onFocus={() => setImageHovered(true)}
              onBlur={() => setImageHovered(false)}
              tabIndex={0}
            />
          )}
          {!v && <div className="text-[12px] text-inkmuted">No image available for this barcode.</div>}
        </div>
      );
    }
    if (kind === 'item') {
      return <MultiSelect mode="single" options={items} value={v || ''} placeholder="Select item" onChange={pickItem} />;
    }
    if (k === 'productType') {
      const options = [...productTypes];
      if (v && !options.some((option) => option.value === v)) options.push({ value: v, label: v });
      /* a barcode lookup sets the type from the item's group: lock it then. Left editable when the
         lookup found no real type (empty, or an item type such as "Simple"), so one can be chosen. */
      const locked = Boolean(itemDetails && v && productTypes.some((option) => option.value && option.value === v));
      return (
        <select
          className={`f-input${locked ? ' cursor-not-allowed bg-slate-100' : ''}`}
          value={v || ''}
          disabled={locked}
          title={locked ? 'Set from the barcode\'s item group' : undefined}
          onChange={(event) => set(k, event.target.value)}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (kind === 'boolean') {
      if (k === 'isActive') {
        const checked = v !== false;
        const label = 'Is Active';
        return (
          <label className="flex h-[38px] cursor-pointer items-center gap-2">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => set(k, e.target.checked)}
                aria-label={label}
              />
              <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </span>
            <span className="text-[13px] font-medium text-ink">{label}</span>
            <span className="text-[12px] text-inkmuted">{checked ? 'Active' : 'Inactive'}</span>
          </label>
        );
      }
      return (
        <label className="flex h-[38px] cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={Boolean(v)} onChange={(e) => set(k, e.target.checked)} /> {labelOf(k)}
        </label>
      );
    }
    if (kind === 'number') {
      return <input className="f-input" type="number" value={v ?? ''} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => set(k, e.target.value)} />;
    }
    if (kind === 'textarea') {
      return <textarea className="f-input min-h-[70px]" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
    }
    if (kind === 'lines') {
      return <textarea className="f-input min-h-[70px]" placeholder="One per line" value={Array.isArray(v) ? v.join('\n') : (v ?? '')} onChange={(e) => set(k, e.target.value.split('\n'))} />;
    }
    if (kind === 'classification') {
      const productType = String(data.productType || '').trim().toUpperCase();
      const isPlainFabric = productType === 'PLAIN FABRICS';
      const isFabric = productType === 'FABRICS';
      return (
        <ClassificationPicker
          type={k}
          value={Array.isArray(v) ? v.map(String) : []}
          onChange={(value) => set(k, value)}
          businessId={business}
          productType={isPlainFabric || isFabric ? productType : undefined}
          allowCreate={!(
            (k === 'byFabric' && productType === 'DUPATTA')
            || ((isPlainFabric || isFabric) && ['byFabric', 'byColour'].includes(k))
          )}
          optionsOverride={k === 'byFabric' && String(data.productType || '').trim().toUpperCase() === 'DUPATTA'
            ? DUPATTA_FABRIC_OPTIONS.map((name) => ({ _id: name, name }))
            : undefined}
        />
      );
    }
    return <input className="f-input" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
  };

  const wide = (f) => ['textarea', 'lines', 'classification'].includes(kindOf(f));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">{isEdit ? 'Edit product-eccom' : 'Add product-eccom'}</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/ecommerce/product-eccom')}>
            <Icon name="x" size={14} /> Cancel
          </button>
        </div>
        <div className="card-body">
          {!business && <div className="flash flash-err">Select a Business in the top bar first.</div>}
          {business && fields === null && <div className="py-6 text-center text-[13px] text-inkmuted">Loading...</div>}
          {error && <div className="flash flash-err mb-3">{error}</div>}
          {business && fields && (
            <>
            <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
              <div>
                <label className="f-label">Barcode</label>
                <div className="relative">
                  <input
                    className="f-input"
                    value={barcodeInput}
                    placeholder="Search, scan or enter barcode"
                    onFocus={() => setBarcodePickerOpen(true)}
                    onBlur={() => setTimeout(() => setBarcodePickerOpen(false), 150)}
                    onChange={onBarcodeChange}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={barcodePickerOpen}
                  />
                  {barcodePickerOpen && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-pop">
                      {barcodeOptionsLoading ? (
                        <div className="px-3 py-2 text-[12px] text-inkmuted">Searching barcodes...</div>
                      ) : barcodeOptionsError ? (
                        <div className="px-3 py-2 text-[12px] text-danger" role="alert">{barcodeOptionsError}</div>
                      ) : barcodeOptions.length ? (
                        barcodeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="block w-full border-b border-line px-3 py-2 text-left text-[12px] text-ink hover:bg-slate-50"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectBarcode(option)}
                          >
                            {option.label}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[12px] text-inkmuted">
                          {barcodeInput.trim() ? 'No matching barcodes.' : 'No barcodes found for this business.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {barcodeLoading && <div className="mt-0.5 text-[12px] text-inkmuted">Looking up barcode...</div>}
                {barcodeError && <div className="mt-0.5 text-[12px] text-danger">{barcodeError}</div>}
              </div>
              <div>
                <label className="f-label">Item Code</label>
                <input className="f-input" value={itemDetails?.itemCode || ''} readOnly />
              </div>
              <div>
                <label className="f-label">Group</label>
                <input className="f-input" value={itemDetails?.group || ''} readOnly />
              </div>
              <div>
                <label className="f-label">E-Comm Off (%)</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.ecommOffPercent ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('ecommOffPercent', event.target.value)}
                />
              </div>
              <div>
                <label className="f-label">Price</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.barcodePriceOverride ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('barcodePriceOverride', event.target.value)}
                />
              </div>
              <div>
                <label className="f-label">HSN Code</label>
                <input className="f-input" value={itemDetails?.hsnCode || ''} readOnly />
              </div>
              <div>
                <label className="f-label">Quantity</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.barcodeQtyOverride ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('barcodeQtyOverride', event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
              {ordered.map((f) => (
                <div key={f.k} className={wide(f) ? 'md:col-span-3' : undefined}>
                  {kindOf(f) !== 'boolean' && kindOf(f) !== 'classification' && (
                    <label className="f-label">
                      {f.k === 'itemId' ? 'Item' : fieldLabel(f.k)}
                      {(f.k === 'itemId' || f.k === 'displayName') && <span className="text-danger"> *</span>}
                    </label>
                  )}
                  {input(f)}
                  {errors[f.k] && <div className="mt-0.5 text-[12px] text-danger">{errors[f.k]}</div>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => router.push('/admin/ecommerce/product-eccom')}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save
              </button>
            </div>
            </>
          )}
        </div>
      </div>
      {imageHovered && data.image && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6">
          <img
            src={data.image}
            alt="Product image preview"
            className="max-h-[80vh] max-w-[80vw] rounded border border-white/30 bg-white object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
