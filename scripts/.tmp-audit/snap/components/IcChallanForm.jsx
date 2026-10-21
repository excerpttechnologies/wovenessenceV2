// 'use client';
// import { useCallback, useEffect, useMemo, useState } from 'react';
// import { useRouter } from 'next/navigation';
// import Icon from './Icon';
// import Field from './Field';
// import MultiSelect from './MultiSelect';
// import { useScope } from './ScopeContext';
// import {
//   FIELDS as DC_FIELDS, GRID_COLS, INFO, BLANK_ROW,
//   computeTotals, num, money,
// } from '@/app/admin/transaction/intercompanysell/deliverychallan/fields';

// /* ==========================================================================
//    Inter company line-entry document - add / edit.

//    Shared by Delivery Challan and Auto Purchase Return: same header shape,
//    same scan-to-add grid, same totals block. The caller passes its own field
//    list through `cfg.fields`; omit it and the Delivery Challan spec is used,
//    so the challan pages need no change.

//    Three things this screen does that the generic TransactionFormView can't:

//      - the Location Name list depends on the Business chosen ON THIS FORM,
//        not on the business in the top bar. A plain `ref` field always scopes
//        to the top-bar business, so those two selectors are wired by hand.
//      - picking a Business copies its GSTIN and address into the two readonly
//        "Customer" boxes, the way the deployed screen does.
//      - every line figure (Final Rate, Before Tax, the three GST columns, Net
//        Amount) recalculates as you type, and the totals block follows.

//    The maths lives in deliverychallan/fields.js, which the API imports too,
//    so what you watch while typing is what gets stored.

//    NOTE: this file replaces the Phase 1 version. The only behavioural change
//    is that the header now renders `cfg.fields` in order rather than a
//    hardcoded arrangement - which also fixes the awkward conditional shuffle
//    the first version used to slot DC No in on the edit screen.
//    ========================================================================== */

// export default function IcChallanForm({ cfg, id }) {
//   const router = useRouter();
//   const scope = useScope();
//   const isEdit = Boolean(id);

//   const FIELDS = cfg.fields || DC_FIELDS;
//   const docNoKey = cfg.docNoKey || 'dcNo';
//   const docNoLabel = cfg.docNoLabel || 'DC No';

//   /* every header field except the two the form drives itself */
//   const rest = FIELDS.filter((f) => f.k !== 'toBusinessId' && f.k !== 'toLocationId');

//   const [data, setData] = useState(() => {
//     const d = {};
//     FIELDS.forEach((f) => {
//       d[f.k] = f.def === 'today'
//         ? new Date().toISOString().slice(0, 10)
//         : (f.def !== undefined ? f.def : '');
//     });
//     return d;
//   });

//   const [docNo, setDocNo] = useState('');
//   const [rows, setRows] = useState([]);
//   const [headDiscountPct, setHeadDiscountPct] = useState(0);
//   const [headRoffDiscount, setHeadRoffDiscount] = useState(0);

//   const [businesses, setBusinesses] = useState([]);
//   const [locations, setLocations] = useState([]);

//   const [scan, setScan] = useState('');
//   const [errors, setErrors] = useState({});
//   const [flash, setFlash] = useState(null);
//   const [saving, setSaving] = useState(false);

//   const set = (k, v) => {
//     setData((d) => ({ ...d, [k]: v }));
//     setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
//   };

//   /* ------------------------------------------------- destination business */
//   useEffect(() => {
//     fetch('/api/options?ref=business')
//       .then((r) => r.json())
//       .then((d) => setBusinesses(d.options || []))
//       .catch(() => setBusinesses([]));
//   }, []);

//   /* locations of whichever business is picked on THIS form */
//   useEffect(() => {
//     if (!data.toBusinessId) { setLocations([]); return; }
//     fetch('/api/options?ref=companylocations&business=' + data.toBusinessId)
//       .then((r) => r.json())
//       .then((d) => setLocations(d.options || []))
//       .catch(() => setLocations([]));
//   }, [data.toBusinessId]);

//   /* GSTIN and address follow the chosen business */
//   const pickBusiness = async (v) => {
//     setData((d) => ({ ...d, toBusinessId: v, toLocationId: '' }));
//     setErrors((e) => ({ ...e, toBusinessId: undefined }));
//     if (!v) return;
//     try {
//       const r = await fetch('/api/business/' + v);
//       const { doc } = await r.json();
//       if (!doc) return;
//       setData((d) => ({
//         ...d,
//         customerGstn: doc.gstin || '',
//         customerAddress: [doc.addressLine1, doc.addressLine2, doc.city]
//           .filter(Boolean).join(', '),
//       }));
//     } catch { /* leave the two boxes as they are */ }
//   };

//   /* ------------------------------------------------------- load on edit -- */
//   useEffect(() => {
//     if (!id) return;
//     fetch(cfg.endpoint + '/' + id)
//       .then((r) => r.json())
//       .then((d) => {
//         if (!d.doc) return;
//         setData((prev) => {
//           const next = { ...prev };
//           Object.keys(next).forEach((k) => {
//             const v = d.doc[k];
//             if (v === null || v === undefined) return;
//             const t = FIELDS.find((f) => f.k === k)?.type;
//             next[k] = t === 'ref' ? String(v) : (t === 'date' ? String(v).slice(0, 10) : v);
//           });
//           return next;
//         });
//         setDocNo(d.doc[docNoKey] || '');
//         setRows(d.doc.items || []);
//         setHeadDiscountPct(d.doc.discountPercent ?? 0);
//         setHeadRoffDiscount(d.doc.roundOffDiscountAmt ?? 0);
//       });
//   }, [id, cfg.endpoint, docNoKey]);

//   /* ------------------------------------------------------------- rows ---- */
//   const setCell = (i, k, v) =>
//     setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, [k]: v } : r)));

//   const dropRow = (i) => setRows((prev) => prev.filter((_, ri) => ri !== i));

//   /* Scan / type an item code, Enter to add. Resolves against the Item master,
//      then joins HSN -> tax slab -> UOM -> RSP through /api/item/<id>/detail so
//      the line lands with its GST rates already filled. */
//   const addScanned = useCallback(async (code) => {
//     const term = String(code || '').trim();
//     if (!term) return;
//     setFlash(null);

//     try {
//       const r = await fetch(
//         '/api/item?perPage=1&search=' + encodeURIComponent(term)
//         + '&business=' + (scope.business || '')
//       );
//       const d = await r.json();
//       const hit = (d.rows || [])[0];
//       if (!hit) { setFlash({ type: 'err', msg: 'No item found for "' + term + '"' }); return; }

//       let detail = null;
//       try {
//         const dr = await fetch('/api/item/' + hit._id + '/detail');
//         detail = (await dr.json()).item;
//       } catch { /* fall back to the bare item below */ }

//       const slab = detail?.slabs?.[0] || null;

//       setRows((prev) => [...prev, {
//         ...BLANK_ROW,
//         itemId: String(hit._id),
//         itemCode: detail?.itemCode || hit.itemCode || term,
//         itemName: detail?.name || hit.name || '',
//         hsn: detail?.hsnCode || '',
//         uom: detail?.uom || '',
//         slabName: slab ? slab.name : '',
//         igstPct: slab ? slab.igst : 0,
//         cgstPct: slab ? slab.cgst : 0,
//         sgstPct: slab ? slab.sgst : 0,
//         /* pricing setup for an inter-company move has no Contact behind it,
//            so the item's RSP stands in - see the note in fields.js */
//         unitRate: detail?.rsp ?? hit.rsp ?? '',
//         availableQty: detail?.availableQty ?? null,
//         qty: 1,
//       }]);
//       setScan('');
//     } catch {
//       setFlash({ type: 'err', msg: 'Item lookup failed' });
//     }
//   }, [scope.business]);

//   /* ------------------------------------------------------------ totals --- */
//   const totals = useMemo(
//     () => computeTotals(rows, {
//       discountPercent: headDiscountPct,
//       roundOffDiscountAmt: headRoffDiscount,
//     }),
//     [rows, headDiscountPct, headRoffDiscount]
//   );

//   /* ------------------------------------------------------------- save ---- */
//   async function submit() {
//     setSaving(true);
//     setFlash(null);
//     try {
//       const lines = rows.map((r, i) => {
//         const c = totals.calc[i];
//         return {
//           itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
//           hsn: r.hsn, slabName: r.slabName, uom: r.uom,
//           qty: num(r.qty), availableQty: r.availableQty ?? null,
//           unitRate: num(r.unitRate),
//           discountPct: num(r.discountPct), discount: c.discount,
//           roffDiscount: num(r.roffDiscount),
//           finalRate: c.finalRate, beforeTax: c.beforeTax,
//           igstPct: num(r.igstPct), cgstPct: num(r.cgstPct), sgstPct: num(r.sgstPct),
//           igstAmount: c.igst, cgstAmount: c.cgst, sgstAmount: c.sgst,
//           netAmount: c.netAmount,
//         };
//       });

//       const payload = {
//         data: {
//           ...data,
//           items: lines,
//           taxableValue: totals.taxableValue,
//           discountPercent: num(headDiscountPct),
//           roundOffDiscountAmt: num(headRoffDiscount),
//           igstTotal: totals.igstTotal,
//           cgstTotal: totals.cgstTotal,
//           sgstTotal: totals.sgstTotal,
//           roundOff: totals.roundOff,
//           totalQty: totals.totalQty,
//           netValue: totals.netValue,
//         },
//         business: scope.business, location: scope.location, finYear: scope.finYear,
//       };

//       const r = await fetch(cfg.endpoint + (id ? '/' + id : ''), {
//         method: id ? 'PUT' : 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload),
//       });
//       const d = await r.json();

//       if (r.status === 422) {
//         setErrors(d.errors || {});
//         setFlash({ type: 'err', msg: 'Please correct the highlighted fields.' });
//         return;
//       }
//       if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Save failed' }); return; }

//       router.push(cfg.basePath + cfg.slugPath);
//     } finally {
//       setSaving(false);
//     }
//   }

//   /* the four numeric cells the user types into */
//   const NUMERIC = ['qty', 'unitRate', 'discountPct', 'roffDiscount'];

//   return (
//     <div className="card">
//       <div className="card-head">
//         <span className="card-title">{cfg.addTitle}</span>
//       </div>

//       <div className="card-body">
//         {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

//         {/* ---------------------------------------------------- header --- */}
//         <div className="form-grid-4">
//           <div>
//             <label className="f-label">Business<span className="f-req">*</span></label>
//             <select
//               className="f-input"
//               value={data.toBusinessId || ''}
//               onChange={(e) => pickBusiness(e.target.value)}
//             >
//               <option value="">--Select--</option>
//               {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
//             </select>
//             {errors.toBusinessId && <div className="f-err">{errors.toBusinessId}</div>}
//           </div>

//           <div>
//             <label className="f-label">Location Name<span className="f-req">*</span></label>
//             <select
//               className="f-input"
//               value={data.toLocationId || ''}
//               onChange={(e) => set('toLocationId', e.target.value)}
//               disabled={!data.toBusinessId}
//             >
//               <option value="">--Select--</option>
//               {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
//             </select>
//             {errors.toLocationId && <div className="f-err">{errors.toLocationId}</div>}
//           </div>

//           {/* issued by the server on save, so it only exists on the edit screen */}
//           {isEdit && (
//             <div>
//               <label className="f-label">{docNoLabel}<span className="f-req">*</span></label>
//               <input className="f-input bg-[#eff2f7] text-inkmuted" value={docNo} readOnly />
//             </div>
//           )}

//           {rest.map((f) => (
//             <Field key={f.k} f={f} value={data[f.k]} error={errors[f.k]} onChange={set} />
//           ))}
//         </div>

//         {/* ------------------------------------------------------ info --- */}
//         {cfg.showInfo !== false && (
//           <div className="info-box mt-4">
//             <div className="mb-1.5 flex items-center gap-1.5 font-bold underline">
//               <Icon name="eye" size={14} /> Info
//             </div>
//             <ol className="list-decimal pl-5">
//               {(cfg.info || INFO).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
//             </ol>
//           </div>
//         )}

//         {/* ------------------------------------------------------ scan --- */}
//         <div className="kbd-hint">
//           <Icon name="eye" size={13} /> Shortcut: Press <span className="kbd">Enter</span> /
//           <span className="kbd">F9</span> / <span className="kbd">Tab</span>
//           to add item &amp; and <b>box must be in focus</b>.
//         </div>
//         <div className="mb-3 flex max-w-[760px]">
//           <input
//             className="f-input rounded-r-none"
//             placeholder="Enter item code"
//             value={scan}
//             onChange={(e) => setScan(e.target.value)}
//             onKeyDown={(e) => {
//               if (['Enter', 'F9', 'Tab'].includes(e.key)) { e.preventDefault(); addScanned(scan); }
//             }}
//           />
//           <button type="button" className="btn btn-dark rounded-l-none" onClick={() => addScanned(scan)}>
//             <Icon name="search" size={14} />
//           </button>
//         </div>

//         {/* ------------------------------------------------------ grid --- */}
//         <div className="overflow-x-auto">
//           <table className="dt">
//             <thead>
//               <tr>{GRID_COLS.map((c) => <th key={c}>{c}</th>)}</tr>
//             </thead>
//             <tbody>
//               {rows.length === 0 && (
//                 <tr><td colSpan={GRID_COLS.length} className="dt-empty">
//                     {cfg.emptyGrid || 'No Items Added'}
//                   </td></tr>
//               )}
//               {rows.map((r, i) => {
//                 const c = totals.calc[i];
//                 const over = r.availableQty !== null
//                   && r.availableQty !== undefined
//                   && num(r.qty) > num(r.availableQty);
//                 return (
//                   <tr key={i}>
//                     <td className="text-center">{i + 1}</td>
//                     <td>{r.itemCode}</td>
//                     <td>{r.itemName}</td>
//                     <td>{r.hsn}</td>
//                     <td>{r.slabName}</td>
//                     <td>{r.uom}</td>
//                     <td>
//                       <input
//                         type="number"
//                         className={'f-input h-8 w-[86px] ' + (over ? 'border-danger' : '')}
//                         value={r.qty ?? ''}
//                         onChange={(e) => setCell(i, 'qty', e.target.value)}
//                       />
//                       {/* the deployed screen prints the stock ceiling here;
//                           shown only when something supplied one */}
//                       {r.availableQty !== null && r.availableQty !== undefined && (
//                         <div className={'pt-0.5 text-[11px] ' + (over ? 'text-danger' : 'text-inkmuted')}>
//                           (Max: {r.availableQty})
//                         </div>
//                       )}
//                     </td>
//                     {['unitRate', 'discountPct', 'roffDiscount'].map((k) => (
//                       <td key={k}>
//                         <input
//                           type="number"
//                           className="f-input h-8 w-[86px]"
//                           value={r[k] ?? ''}
//                           onChange={(e) => setCell(i, k, e.target.value)}
//                         />
//                       </td>
//                     ))}
//                     <td className="text-right">{money(c.finalRate)}</td>
//                     <td className="text-right">{money(c.beforeTax)}</td>
//                     <td className="text-right">{money(c.igst)}</td>
//                     <td className="text-right">{money(c.cgst)}</td>
//                     <td className="text-right">{money(c.sgst)}</td>
//                     <td className="text-right font-bold">{money(c.netAmount)}</td>
//                     <td>
//                       <button type="button" className="act-btn bg-danger" onClick={() => dropRow(i)}>
//                         <Icon name="trash" size={12} />
//                       </button>
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//         </div>

//         {/* ---------------------------------------------------- totals --- */}
//         <div className="mt-5">
//           <table className="w-full border-collapse text-[13.5px]">
//             <tbody>
//               <tr className="border-b border-line">
//                 <td className="w-[38%] py-2 pr-3 text-right text-cell">Taxable Value</td>
//                 <td className="w-[22%]" />
//                 <td className="w-[18%] px-2" />
//                 <td className="w-[4%] text-center text-[#c07b2a]">+</td>
//                 <td className="py-2 pr-3 text-right">{money(totals.taxableValue)}</td>
//               </tr>
//               <tr className="border-b border-line">
//                 <td className="py-2 pr-3 text-right text-cell">Discount(%)</td>
//                 <td />
//                 <td className="px-2">
//                   <input
//                     type="number" className="f-input h-8 text-center"
//                     value={headDiscountPct}
//                     onChange={(e) => setHeadDiscountPct(e.target.value)}
//                   />
//                 </td>
//                 <td className="text-center text-[#c07b2a]">&minus;</td>
//                 <td className="py-2 pr-3 text-right">{money(totals.headDiscount)}</td>
//               </tr>
//               <tr className="border-b border-line">
//                 <td className="py-2 pr-3 text-right text-cell">RoundOff Discount(Amt)</td>
//                 <td />
//                 <td className="px-2">
//                   <input
//                     type="number" className="f-input h-8 text-center"
//                     value={headRoffDiscount}
//                     onChange={(e) => setHeadRoffDiscount(e.target.value)}
//                   />
//                 </td>
//                 <td className="text-center text-[#c07b2a]">&minus;</td>
//                 <td className="py-2 pr-3 text-right" />
//               </tr>

//               {(totals.cgstTotal > 0 || totals.sgstTotal > 0) && (
//                 <tr className="border-b border-line">
//                   <td className="py-2 pr-3 text-right text-cell" />
//                   <td />
//                   <td />
//                   <td className="text-center text-[#c07b2a]">+</td>
//                   <td className="py-2 pr-3 text-right">
//                     <span className="mr-4 text-cell">
//                       CGST + SGST ({totals.cgstPct} + {totals.sgstPct}) %
//                     </span>
//                     {money(totals.cgstTotal + totals.sgstTotal)}
//                   </td>
//                 </tr>
//               )}
//               {totals.igstTotal > 0 && (
//                 <tr className="border-b border-line">
//                   <td className="py-2 pr-3 text-right text-cell" />
//                   <td /><td />
//                   <td className="text-center text-[#c07b2a]">+</td>
//                   <td className="py-2 pr-3 text-right">
//                     <span className="mr-4 text-cell">IGST ({totals.igstPct}) %</span>
//                     {money(totals.igstTotal)}
//                   </td>
//                 </tr>
//               )}

//               <tr className="border-b border-line">
//                 <td className="py-2 pr-3 text-right text-cell">Round Off</td>
//                 <td /><td /><td />
//                 <td className="py-2 pr-3 text-right">{money(totals.roundOff)}</td>
//               </tr>
//               <tr className="font-bold">
//                 <td className="py-2 pr-3 text-right">Net Value</td>
//                 <td /><td /><td />
//                 <td className="py-2 pr-3 text-right">{money(totals.netValue)}</td>
//               </tr>
//             </tbody>
//           </table>
//         </div>

//         <button
//           type="button"
//           className="btn btn-primary mx-auto mt-4 flex h-[38px] w-full max-w-[430px] justify-center"
//           onClick={submit}
//           disabled={saving}
//         >
//           {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Submit
//         </button>
//       </div>
//     </div>
//   );
// }













'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Field from './Field';
import MultiSelect from './MultiSelect';
import { useScope } from './ScopeContext';
import {
  FIELDS as DC_FIELDS, GRID_COLS, INFO, BLANK_ROW,
  computeTotals, num, money,
} from '@/app/admin/transaction/intercompanysell/deliverychallan/fields';

/* ==========================================================================
   Inter company line-entry document - add / edit.

   Shared by Delivery Challan and Auto Purchase Return: same header shape,
   same scan-to-add grid, same totals block. The caller passes its own field
   list through `cfg.fields`; omit it and the Delivery Challan spec is used,
   so the challan pages need no change.

   Three things this screen does that the generic TransactionFormView can't:

     - the Location Name list depends on the Business chosen ON THIS FORM,
       not on the business in the top bar. A plain `ref` field always scopes
       to the top-bar business, so those two selectors are wired by hand.
     - picking a Business copies its GSTIN and address into the two readonly
       "Customer" boxes, the way the deployed screen does.
     - every line figure (Final Rate, Before Tax, the three GST columns, Net
       Amount) recalculates as you type, and the totals block follows.

   The maths lives in deliverychallan/fields.js, which the API imports too,
   so what you watch while typing is what gets stored.

   NOTE: this file replaces the Phase 1 version. The only behavioural change
   is that the header now renders `cfg.fields` in order rather than a
   hardcoded arrangement - which also fixes the awkward conditional shuffle
   the first version used to slot DC No in on the edit screen.
   ========================================================================== */

export default function IcChallanForm({ cfg, id }) {
  const router = useRouter();
  const scope = useScope();
  const isEdit = Boolean(id);

  const FIELDS = cfg.fields || DC_FIELDS;
  const docNoKey = cfg.docNoKey || 'dcNo';
  const docNoLabel = cfg.docNoLabel || 'DC No';

  /* every header field except the two the form drives itself */
  const rest = FIELDS.filter((f) => f.k !== 'toBusinessId' && f.k !== 'toLocationId');

  const [data, setData] = useState(() => {
    const d = {};
    FIELDS.forEach((f) => {
      d[f.k] = f.def === 'today'
        ? new Date().toISOString().slice(0, 10)
        : (f.def !== undefined ? f.def : '');
    });
    return d;
  });

  const [docNo, setDocNo] = useState('');
  const [rows, setRows] = useState([]);
  const [headDiscountPct, setHeadDiscountPct] = useState(0);
  const [headRoffDiscount, setHeadRoffDiscount] = useState(0);

  const [businesses, setBusinesses] = useState([]);
  const [locations, setLocations] = useState([]);

  const [scan, setScan] = useState('');
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  /* ------------------------------------------------- destination business */
  useEffect(() => {
    fetch('/api/options?ref=business')
      .then((r) => r.json())
      .then((d) => setBusinesses(d.options || []))
      .catch(() => setBusinesses([]));
  }, []);

  /* locations of whichever business is picked on THIS form */
  useEffect(() => {
    if (!data.toBusinessId) { setLocations([]); return; }
    fetch('/api/options?ref=companylocations&business=' + data.toBusinessId)
      .then((r) => r.json())
      .then((d) => setLocations(d.options || []))
      .catch(() => setLocations([]));
  }, [data.toBusinessId]);

  /* GSTIN and address follow the chosen business */
  const pickBusiness = async (v) => {
    setData((d) => ({ ...d, toBusinessId: v, toLocationId: '' }));
    setErrors((e) => ({ ...e, toBusinessId: undefined }));
    if (!v) return;
    try {
      const r = await fetch('/api/business/' + v);
      const { doc } = await r.json();
      if (!doc) return;
      setData((d) => ({
        ...d,
        customerGstn: doc.gstin || '',
        customerAddress: [doc.addressLine1, doc.addressLine2, doc.city]
          .filter(Boolean).join(', '),
      }));
    } catch { /* leave the two boxes as they are */ }
  };

  /* ------------------------------------------------------- load on edit -- */
  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setData((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            const v = d.doc[k];
            if (v === null || v === undefined) return;
            const t = FIELDS.find((f) => f.k === k)?.type;
            next[k] = t === 'ref' ? String(v) : (t === 'date' ? String(v).slice(0, 10) : v);
          });
          return next;
        });
        setDocNo(d.doc[docNoKey] || '');
        setRows(d.doc.items || []);
        setHeadDiscountPct(d.doc.discountPercent ?? 0);
        setHeadRoffDiscount(d.doc.roundOffDiscountAmt ?? 0);
      });
  }, [id, cfg.endpoint, docNoKey]);

  /* ------------------------------------------------------------- rows ---- */
  const setCell = (i, k, v) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, [k]: v } : r)));

  const dropRow = (i) => setRows((prev) => prev.filter((_, ri) => ri !== i));

  /* Scan / type an item code, Enter to add.

     One call to the challan's own item-lookup, which does everything the
     Info box promises: rejects a code with no GRC barcode row, joins
     HSN -> tax slab -> UOM, decides IGST vs CGST+SGST from the two GSTINs'
     state codes, and returns the stock ceiling that prints as "(Max: n)". */
  const addScanned = useCallback(async (code) => {
    const term = String(code || '').trim();
    if (!term) return;
    setFlash(null);

    const qs = new URLSearchParams({
      code: term,
      business: scope.business || '',
      location: scope.location || '',
      finYear: scope.finYear || '',
      toBusiness: data.toBusinessId || '',
      stockPoint: data.stockPointId || '',
    });

    try {
      const r = await fetch((cfg.lookupEndpoint || '/api/ic-delivery-challan/item-lookup') + '?' + qs);
      const d = await r.json();

      /* the lookup states WHY a code was refused - surface it rather than a
         generic "not found" */
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Item lookup failed' }); return; }

      const it = d.item;
      setRows((prev) => {
        /* scanning a code already on the challan should add ONE to that line,
           not open a second line for the same item - which is what a barcode
           gun repeating a scan produces */
        const at = prev.findIndex(
          (x) => String(x.itemCode).trim().toLowerCase()
            === String(it.itemCode).trim().toLowerCase()
        );
        if (at >= 0) {
          return prev.map((x, xi) => (xi === at ? { ...x, qty: num(x.qty) + 1 } : x));
        }
        return [...prev, { ...BLANK_ROW, ...it, availableQty: it.maxQty ?? null, qty: 1 }];
      });
      setScan('');
    } catch {
      setFlash({ type: 'err', msg: 'Item lookup failed' });
    }
  }, [scope.business, scope.location, scope.finYear, data.toBusinessId, data.stockPointId, cfg.lookupEndpoint]);

  /* ------------------------------------------------------------ totals --- */
  const totals = useMemo(
    () => computeTotals(rows, {
      discountPercent: headDiscountPct,
      roundOffDiscountAmt: headRoffDiscount,
    }),
    [rows, headDiscountPct, headRoffDiscount]
  );

  /* ------------------------------------------------------------- save ---- */
  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const lines = rows.map((r, i) => {
        const c = totals.calc[i];
        return {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
          hsn: r.hsn, slabName: r.slabName, uom: r.uom,
          qty: num(r.qty), availableQty: r.availableQty ?? null,
          unitRate: num(r.unitRate),
          discountPct: num(r.discountPct), discount: c.discount,
          roffDiscount: num(r.roffDiscount),
          finalRate: c.finalRate, beforeTax: c.beforeTax,
          igstPct: num(r.igstPct), cgstPct: num(r.cgstPct), sgstPct: num(r.sgstPct),
          igstAmount: c.igst, cgstAmount: c.cgst, sgstAmount: c.sgst,
          netAmount: c.netAmount,
        };
      });

      const payload = {
        data: {
          ...data,
          items: lines,
          taxableValue: totals.taxableValue,
          discountPercent: num(headDiscountPct),
          roundOffDiscountAmt: num(headRoffDiscount),
          igstTotal: totals.igstTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          roundOff: totals.roundOff,
          totalQty: totals.totalQty,
          netValue: totals.netValue,
        },
        business: scope.business, location: scope.location, finYear: scope.finYear,
      };

      const r = await fetch(cfg.endpoint + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();

      if (r.status === 422) {
        setErrors(d.errors || {});
        setFlash({ type: 'err', msg: 'Please correct the highlighted fields.' });
        return;
      }
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Save failed' }); return; }

      router.push(cfg.basePath + cfg.slugPath);
    } finally {
      setSaving(false);
    }
  }

  /* the four numeric cells the user types into */
  const NUMERIC = ['qty', 'unitRate', 'discountPct', 'roffDiscount'];

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{cfg.addTitle}</span>
      </div>

      <div className="card-body">
        {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

        {/* ---------------------------------------------------- header --- */}
        <div className="form-grid-4">
          <div>
            <label className="f-label">Business<span className="f-req">*</span></label>
            <select
              className="f-input"
              value={data.toBusinessId || ''}
              onChange={(e) => pickBusiness(e.target.value)}
            >
              <option value="">--Select--</option>
              {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.toBusinessId && <div className="f-err">{errors.toBusinessId}</div>}
          </div>

          <div>
            <label className="f-label">Location Name<span className="f-req">*</span></label>
            <select
              className="f-input"
              value={data.toLocationId || ''}
              onChange={(e) => set('toLocationId', e.target.value)}
              disabled={!data.toBusinessId}
            >
              <option value="">--Select--</option>
              {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.toLocationId && <div className="f-err">{errors.toLocationId}</div>}
          </div>

          {/* issued by the server on save, so it only exists on the edit screen */}
          {isEdit && (
            <div>
              <label className="f-label">{docNoLabel}<span className="f-req">*</span></label>
              <input className="f-input bg-[#eff2f7] text-inkmuted" value={docNo} readOnly />
            </div>
          )}

          {rest.map((f) => (
            <Field key={f.k} f={f} value={data[f.k]} error={errors[f.k]} onChange={set} />
          ))}
        </div>

        {/* ------------------------------------------------------ info --- */}
        {cfg.showInfo !== false && (
          <div className="info-box mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 font-bold underline">
              <Icon name="eye" size={14} /> Info
            </div>
            <ol className="list-decimal pl-5">
              {(cfg.info || INFO).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
            </ol>
          </div>
        )}

        {/* ------------------------------------------------------ scan --- */}
        <div className="kbd-hint">
          <Icon name="eye" size={13} /> Shortcut: Press <span className="kbd">Enter</span> /
          <span className="kbd">F9</span> / <span className="kbd">Tab</span>
          to add item &amp; and <b>box must be in focus</b>.
        </div>
        <div className="mb-3 flex max-w-[760px]">
          <input
            className="f-input rounded-r-none"
            placeholder="Enter item code"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (['Enter', 'F9', 'Tab'].includes(e.key)) { e.preventDefault(); addScanned(scan); }
            }}
          />
          <button type="button" className="btn btn-dark rounded-l-none" onClick={() => addScanned(scan)}>
            <Icon name="search" size={14} />
          </button>
        </div>

        {/* ------------------------------------------------------ grid --- */}
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>{GRID_COLS.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={GRID_COLS.length} className="dt-empty">
                    {cfg.emptyGrid || 'No Items Added'}
                  </td></tr>
              )}
              {rows.map((r, i) => {
                const c = totals.calc[i];
                const over = r.availableQty !== null
                  && r.availableQty !== undefined
                  && num(r.qty) > num(r.availableQty);
                return (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.hsn}</td>
                    <td>{r.slabName}</td>
                    <td>{r.uom}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className={'f-input h-8 w-[86px] ' + (over ? 'border-danger' : '')}
                        value={r.qty ?? ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          /* a negative quantity on a challan is meaningless -
                             it would flip the line's sign all the way through
                             to the invoice's net value */
                          const v = e.target.value;
                          setCell(i, 'qty', v === '' ? '' : Math.max(0, Number(v)));
                        }}
                      />
                      {/* the deployed screen prints the stock ceiling here;
                          shown only when something supplied one */}
                      {r.availableQty !== null && r.availableQty !== undefined && (
                        <div className={'pt-0.5 text-[11px] ' + (over ? 'text-danger' : 'text-inkmuted')}>
                          (Max: {r.availableQty})
                        </div>
                      )}
                    </td>
                    {['unitRate', 'discountPct', 'roffDiscount'].map((k) => (
                      <td key={k}>
                        <input
                          type="number"
                          className="f-input h-8 w-[86px]"
                          value={r[k] ?? ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => setCell(i, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="text-right">{money(c.finalRate)}</td>
                    <td className="text-right">{money(c.beforeTax)}</td>
                    <td className="text-right">{money(c.igst)}</td>
                    <td className="text-right">{money(c.cgst)}</td>
                    <td className="text-right">{money(c.sgst)}</td>
                    <td className="text-right font-bold">{money(c.netAmount)}</td>
                    <td>
                      <button type="button" className="act-btn bg-danger" onClick={() => dropRow(i)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------------------- totals --- */}
        <div className="mt-5">
          <table className="w-full border-collapse text-[13.5px]">
            <tbody>
              <tr className="border-b border-line">
                <td className="w-[38%] py-2 pr-3 text-right text-cell">Taxable Value</td>
                <td className="w-[22%]" />
                <td className="w-[18%] px-2" />
                <td className="w-[4%] text-center text-[#c07b2a]">+</td>
                <td className="py-2 pr-3 text-right">{money(totals.taxableValue)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3 text-right text-cell">Discount(%)</td>
                <td />
                <td className="px-2">
                  <input
                    type="number" className="f-input h-8 text-center"
                    value={headDiscountPct}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setHeadDiscountPct(e.target.value)}
                  />
                </td>
                <td className="text-center text-[#c07b2a]">&minus;</td>
                <td className="py-2 pr-3 text-right">{money(totals.headDiscount)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 pr-3 text-right text-cell">RoundOff Discount(Amt)</td>
                <td />
                <td className="px-2">
                  <input
                    type="number" className="f-input h-8 text-center"
                    value={headRoffDiscount}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setHeadRoffDiscount(e.target.value)}
                  />
                </td>
                <td className="text-center text-[#c07b2a]">&minus;</td>
                <td className="py-2 pr-3 text-right" />
              </tr>

              {(totals.cgstTotal > 0 || totals.sgstTotal > 0) && (
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 text-right text-cell" />
                  <td />
                  <td />
                  <td className="text-center text-[#c07b2a]">+</td>
                  <td className="py-2 pr-3 text-right">
                    <span className="mr-4 text-cell">
                      CGST + SGST ({totals.cgstPct} + {totals.sgstPct}) %
                    </span>
                    {money(totals.cgstTotal + totals.sgstTotal)}
                  </td>
                </tr>
              )}
              {totals.igstTotal > 0 && (
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 text-right text-cell" />
                  <td /><td />
                  <td className="text-center text-[#c07b2a]">+</td>
                  <td className="py-2 pr-3 text-right">
                    <span className="mr-4 text-cell">IGST ({totals.igstPct}) %</span>
                    {money(totals.igstTotal)}
                  </td>
                </tr>
              )}

              <tr className="border-b border-line">
                <td className="py-2 pr-3 text-right text-cell">Round Off</td>
                <td /><td /><td />
                <td className="py-2 pr-3 text-right">{money(totals.roundOff)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-2 pr-3 text-right">Net Value</td>
                <td /><td /><td />
                <td className="py-2 pr-3 text-right">{money(totals.netValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="btn btn-primary mx-auto mt-4 flex h-[38px] w-full max-w-[430px] justify-center"
          onClick={submit}
          disabled={saving}
        >
          {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Submit
        </button>
      </div>
    </div>
  );
}