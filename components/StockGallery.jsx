'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import NumberedPager from './NumberedPager';
import { useOptions } from './useOptions';
import { useScope } from './ScopeContext';
import { download, fmt, toCsv } from '@/lib/format';

/* ==========================================================================
   STOCK GALLERY - the visual inventory screen.

   A card per item in stock, from /api/reports/stock-gallery, which aggregates
   the same units Master Stock Report lists: barcode rows still IN_STOCK. The
   image is the unit's own photo, then the Item master's, then a lettered
   placeholder - an item with no photograph shows that it has none rather
   than a stock photo of something else.

   This is NOT built on components/ReportView.jsx. ReportView renders tables;
   a responsive card grid, and a drawer that lists the units behind a card,
   are a different shape of screen. Both still answer to the same two
   conventions every report follows: the route does the filtering, sorting
   and paging server-side, and the top-bar scope (business / location /
   financial year) is on every request.

   Sorting is a SERVER sort (?sort=value|qoh|name|rsp|rate|age) because the
   page only holds one window of the result - sorting what is on screen would
   sort the window, not the report.
   ========================================================================== */

const SORTS = [
  { k: 'value', label: 'Stock Value (high to low)' },
  { k: 'qoh', label: 'Quantity (high to low)' },
  { k: 'name', label: 'Item Name (A to Z)' },
  { k: 'rsp', label: 'RSP (high to low)' },
  { k: 'rate', label: 'Purchase Rate (high to low)' },
  { k: 'age', label: 'Age (oldest first)' },
];

const BLANK = {
   location: '', groupId: '', subGroupId: '', itemId: [], supplierId: [], search: '',
  qohMin: '', qohMax: '', rspMin: '', rspMax: '',
  rateMin: '', rateMax: '', ageMin: '', ageMax: '', age: '',
};


const IMAGE_REPORT_BLANK = {
  ...BLANK,
  itemId: '',
  supplierId: '',
};

const AGE_FILTERS = [
  { value: '0-30', label: '0 - 30 Days', min: 0, max: 30 },
  { value: '31-60', label: '31 - 60 Days', min: 31, max: 60 },
  { value: '61-90', label: '61 - 90 Days', min: 61, max: 90 },
  { value: '91-180', label: '91 - 180 Days', min: 91, max: 180 },
  { value: '181+', label: '181+ Days', min: 181 },
];
/* price / quantity / age bounds - typed, not picked: the useful bounds are
   numbers a person has in mind, and a picker of every value would be the
   warehouse itself */
// function Bound({ label, minKey, maxKey, f, set }) {
//   return (
//     <div className="min-w-0">
//       <label className="mb-[5px] block text-[12.5px] text-ink">{label}</label>
//       <div className="flex items-center gap-1.5">
//         <input
//           className="f-input"
//           placeholder="Min"
//           inputMode="decimal"
//           value={f[minKey]}
//           onChange={(e) => set(minKey, e.target.value)}
//         />
//         <span className="text-inkmuted">-</span>
//         <input
//           className="f-input"
//           placeholder="Max"
//           inputMode="decimal"
//           value={f[maxKey]}
//           onChange={(e) => set(maxKey, e.target.value)}
//         />
//       </div>
//     </div>
//   );
// }

function Bound({ label, minKey, maxKey, f, set, startEnd = false }) {
  return (
    <div className="min-w-0">
      <label className="mb-[5px] block text-[12.5px] text-ink">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          className="f-input"
          placeholder={startEnd ? 'Start' : 'Min'}
          inputMode="decimal"
          value={f[minKey]}
          onChange={(e) => set(minKey, e.target.value)}
        />
        <span className="text-inkmuted">-</span>
        <input
          className="f-input"
          placeholder={startEnd ? 'End' : 'Max'}
          inputMode="decimal"
          value={f[maxKey]}
          onChange={(e) => set(maxKey, e.target.value)}
        />
      </div>
    </div>
  );
}



function ReportField({ label, children }) {
  return (
    <div className="min-w-0">
      <label className="mb-[5px] block text-[12.5px] text-ink">{label}</label>
      {children}
    </div>
  );
}


function Card({ card, onOpen }) {
  const [broken, setBroken] = useState(false);
  const showImage = card.imageUrl && !broken;
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="overflow-hidden rounded-lg border border-line bg-white text-left transition hover:border-brand hover:shadow-sm"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUrl}
          alt={card.itemName || card.itemCode}
          className="h-40 w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-[#f2f4f8] text-[26px] font-bold text-[#9aa6ba]">
          {(card.itemCode || card.itemName || '?').slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="p-3">
        <div className="truncate text-[13.5px] font-bold text-ink" title={card.itemName}>
          {card.itemName || card.itemCode || '(untitled)'}
        </div>
        <div className="truncate text-[12px] text-inkmuted">{card.itemCode}</div>
        {(card.groupName || card.subGroupName) && (
          <div className="mt-1 truncate text-[11.5px] text-inkmuted">
            {[card.groupName, card.subGroupName].filter(Boolean).join(' / ')}
          </div>
        )}
        {card.supplier && (
          <div className="truncate text-[11.5px] text-inkmuted" title={card.supplier}>
            {card.supplier}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
          <span className="text-inkmuted">QOH</span>
          <span className="text-right font-semibold">{card.qoh}</span>
          <span className="text-inkmuted">Pur. Rate</span>
          <span className="text-right">{card.purchaseRate.toFixed(2)}</span>
          <span className="text-inkmuted">RSP</span>
          <span className="text-right">{card.rsp.toFixed(2)}</span>
          <span className="text-inkmuted">Value</span>
          <span className="text-right font-semibold">{card.stockValue.toFixed(2)}</span>
          <span className="text-inkmuted">Age</span>
          <span className="text-right">{card.age === null ? '-' : card.age + ' d'}</span>
        </div>
      </div>
    </button>
  );
}

// function UnitsDrawer({ card, business, onClose }) {
//   const [state, setState] = useState({ loading: true, units: [], note: '', error: '' });

//   useEffect(() => {
//     let off = false;
//     const q = new URLSearchParams({ units: '1', itemCode: card.itemCode || '', business: business || '' });
//     if (card.itemId) q.set('itemId', card.itemId);
//     fetch('/api/reports/stock-gallery?' + q.toString(), { cache: 'no-store' })
//       .then(async (r) => {
//         const d = await r.json().catch(() => ({}));
//         if (off) return;
//         if (!r.ok) { setState({ loading: false, units: [], note: '', error: d.error || 'Could not open that item.' }); return; }
//         setState({ loading: false, units: d.units || [], note: d.note || '', error: '' });
//       })
//       .catch(() => { if (!off) setState({ loading: false, units: [], note: '', error: 'Could not reach the server.' }); });
//     return () => { off = true; };
//   }, [card.itemCode, card.itemId, business]);

//   return (
//     <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
//       <div
//         className="h-full w-full max-w-[560px] overflow-auto bg-white p-4"
//         onClick={(e) => e.stopPropagation()}
//       >
//         <div className="mb-3 flex items-start gap-2">
//           <div className="min-w-0">
//             <h3 className="truncate text-[15px] font-bold text-ink">{card.itemName || card.itemCode}</h3>
//             <p className="text-[12.5px] text-inkmuted">
//               {card.itemCode} - {card.qoh} in stock, {card.stockValue.toFixed(2)} value
//             </p>
//           </div>
//           <span className="flex-1" />
//           <button type="button" className="btn" onClick={onClose}>
//             <Icon name="x" size={13} /> Close
//           </button>
//         </div>
//         {state.error && <div className="flash flash-err">{state.error}</div>}
//         {state.loading ? (
//           <div className="dt-empty"><span className="spin" /></div>
//         ) : (
//           <table className="dt">
//             <thead>
//               <tr>
//                 <th>Barcode</th>
//                 <th className="text-right">Qty</th>
//                 <th className="text-right">Cost</th>
//                 <th className="text-right">RSP</th>
//                 <th className="text-right">Age</th>
//                 <th>Received</th>
//               </tr>
//             </thead>
//             <tbody>
//               {state.units.length === 0 && (
//                 <tr><td colSpan={6} className="dt-empty">No units in stock.</td></tr>
//               )}
//               {state.units.map((u) => (
//                 <tr key={u.barcodeNo}>
//                   <td>{u.barcodeNo}</td>
//                   <td className="text-right">{u.qty}</td>
//                   <td className="text-right">{u.cost.toFixed(2)}</td>
//                   <td className="text-right">{u.rsp.toFixed(2)}</td>
//                   <td className="text-right">{u.age === null ? '-' : u.age}</td>
//                   <td>{u.stockDate ? String(u.stockDate).slice(0, 10) : '-'}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         )}
//         {state.note && <p className="mt-2 text-[12.5px] text-inkmuted">{state.note}</p>}
//       </div>
//     </div>
//   );
// }



function UnitsDrawer({
  card, business, location, finYear, allLocations, stockImageReport, onClose,
}) {
  const [state, setState] = useState({ loading: true, units: [], note: '', error: '' });

  useEffect(() => {
    let off = false;
    const q = new URLSearchParams({
      units: '1',
      itemCode: card.itemCode || '',
      business: business || '',
      location: location || '',
      finYear: finYear || '',
    });
    if (allLocations) q.set('allLocations', '1');
    if (stockImageReport) q.set('screen', 'stock-image');
    if (card.itemId) q.set('itemId', card.itemId);
    fetch('/api/reports/stock-gallery?' + q.toString(), { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) { setState({ loading: false, units: [], note: '', error: d.error || 'Could not open that item.' }); return; }
        setState({ loading: false, units: d.units || [], note: d.note || '', error: '' });
      })
      .catch(() => { if (!off) setState({ loading: false, units: [], note: '', error: 'Could not reach the server.' }); });
    return () => { off = true; };
  }, [card.itemCode, card.itemId, business, location, finYear, allLocations, stockImageReport]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-[560px] overflow-auto bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold text-ink">{card.itemName || card.itemCode}</h3>
            <p className="text-[12.5px] text-inkmuted">
              {card.itemCode} - {card.qoh} in stock, {card.stockValue.toFixed(2)} value
            </p>
          </div>
          <span className="flex-1" />
          <button type="button" className="btn" onClick={onClose}>
            <Icon name="x" size={13} /> Close
          </button>
        </div>
        {state.error && <div className="flash flash-err">{state.error}</div>}
        {state.loading ? (
          <div className="dt-empty"><span className="spin" /></div>
        ) : (
          <table className="dt">
            <thead>
              <tr>
                <th>Barcode</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Cost</th>
                <th className="text-right">RSP</th>
                <th className="text-right">Age</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {state.units.length === 0 && (
                <tr><td colSpan={6} className="dt-empty">No units in stock.</td></tr>
              )}
              {state.units.map((u) => (
                <tr key={u.barcodeNo}>
                  <td>{u.barcodeNo}</td>
                  <td className="text-right">{u.qty}</td>
                  <td className="text-right">{u.cost.toFixed(2)}</td>
                  <td className="text-right">{u.rsp.toFixed(2)}</td>
                  <td className="text-right">{u.age === null ? '-' : u.age}</td>
                  <td>{u.stockDate ? String(u.stockDate).slice(0, 10) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {state.note && <p className="mt-2 text-[12.5px] text-inkmuted">{state.note}</p>}
      </div>
    </div>
  );
}

// export default function StockGallery() {
//   const { business, location, finYear, isLocationLocked } = useScope();

//   const [draft, setDraft] = useState(BLANK);
//   const [applied, setApplied] = useState(BLANK);
//   const [sort, setSort] = useState('value');
//   const [page, setPage] = useState(1);
//   const [perPage, setPerPage] = useState(24);
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [open, setOpen] = useState(null);

//   const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

//   const locations = useOptions('companylocations', '', Boolean(business));
//   const groups = useOptions('product/group', '', Boolean(business));
//   const items = useOptions('item', '', Boolean(business));
//   const suppliers = useOptions('supplier', '', Boolean(business));

//   const query = useCallback((pg) => {
//     const q = new URLSearchParams({
//       business: business || '',
//       location: location || '',
//       finYear: finYear || '',
//       page: String(pg),
//       perPage: String(perPage),
//       sort,
//     });
//     /* the screen's own Location filter says All Locations */
//     if (!applied.location) q.set('allLocations', '1');
//     Object.entries(applied).forEach(([k, v]) => {
//       if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); }
//       else if (String(v || '').trim()) q.set(k, v);
//     });
//     return q.toString();
//   }, [business, location, finYear, page, perPage, sort, applied]);

//   useEffect(() => {
//     if (!business) { setData(null); return undefined; }
//     let off = false;
//     setLoading(true);
//     setError('');
//     fetch('/api/reports/stock-gallery?' + query(page), { cache: 'no-store' })
//       .then(async (r) => {
//         const d = await r.json().catch(() => ({}));
//         if (off) return;
//         if (!r.ok) { setError(d.error || 'Could not run that report.'); setData(null); return; }
//         setData(d);
//       })
//       .catch(() => { if (!off) { setError('Could not reach the server.'); setData(null); } })
//       .finally(() => { if (!off) setLoading(false); });
//     return () => { off = true; };
//   }, [business, query, page]);

//   const cards = data?.sections?.[0]?.rows || [];
//   const total = Number(data?.total) || 0;
//   const pages = Number(data?.pages) || 1;
//   const shown = Math.max(0, Math.min(perPage, total - (page - 1) * perPage));

//   function search() {
//     setApplied({ ...draft });
//     setPage(1);
//   }
//   function reset() {
//     setDraft(BLANK);
//     setApplied(BLANK);
//     setSort('value');
//     setPage(1);
//   }

//   function exportCsv() {
//     const headers = ['Item Code', 'Item Name', 'Group', 'Sub Group', 'Supplier', 'QOH', 'Purchase Rate', 'RSP', 'Stock Value', 'Age'];
//     const rows = cards.map((c) => [
//       c.itemCode, c.itemName, c.groupName, c.subGroupName, c.supplier,
//       c.qoh, c.purchaseRate.toFixed(2), c.rsp.toFixed(2), c.stockValue.toFixed(2),
//       c.age === null ? '' : c.age,
//     ]);
//     download('stock-gallery.csv', toCsv(headers, rows), 'text/csv');
//   }

//   const tiles = useMemo(() => ([
//     { label: 'Total Products', value: fmt('count', data?.tiles?.totalProducts ?? 0) },
//     { label: 'Total Quantity', value: fmt('amount', data?.tiles?.totalQty ?? 0) },
//     { label: 'Total Stock Value', value: fmt('amount', data?.tiles?.totalValue ?? 0) },
//   ]), [data]);

//   return (
//     <>
//       <div className="mb-3">
//         <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
//           <Icon name="grid" size={18} /> Stock Gallery View
//         </h2>
//         <p className="text-[13px] text-inkmuted">
//           Every item currently in stock, as a card - quantity, cost, RSP, value and age, with its own photo where one exists.
//         </p>
//       </div>

//       <div className="card">
//         <div className="card-body">
//           {error && <div className="flash flash-err">{error}</div>}
//           {!business && <div className="flash flash-err">Select a business in the top bar.</div>}

//           <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
//             <div>
//               <label className="mb-[5px] block text-[12.5px] text-ink">Business Location</label>
//               <MultiSelect
//                 mode="single"
//                 options={locations.options}
//                 loading={locations.loading}
//                 value={draft.location}
//                 placeholder="All Locations"
//                 onChange={(v) => set('location', v)}
//               />
//             </div>
//             <div>
//               <label className="mb-[5px] block text-[12.5px] text-ink">Group / Sub Group</label>
//               <MultiSelect
//                 mode="single"
//                 options={groups.options}
//                 loading={groups.loading}
//                 value={draft.groupId}
//                 placeholder="All Groups"
//                 onChange={(v) => set('groupId', v)}
//               />
//             </div>
//             <div>
//               <label className="mb-[5px] block text-[12.5px] text-ink">Items</label>
//               <MultiSelect
//                 mode="multi"
//                 options={items.options}
//                 loading={items.loading}
//                 value={draft.itemId}
//                 placeholder="Type to search"
//                 onChange={(v) => set('itemId', v)}
//               />
//             </div>
//             <div>
//               <label className="mb-[5px] block text-[12.5px] text-ink">Supplier</label>
//               <MultiSelect
//                 mode="multi"
//                 options={suppliers.options}
//                 loading={suppliers.loading}
//                 value={draft.supplierId}
//                 placeholder="Type to search"
//                 onChange={(v) => set('supplierId', v)}
//               />
//             </div>
//             <Bound label="QOH" minKey="qohMin" maxKey="qohMax" f={draft} set={set} />
//             <Bound label="RSP" minKey="rspMin" maxKey="rspMax" f={draft} set={set} />
//             <Bound label="Purchase Rate" minKey="rateMin" maxKey="rateMax" f={draft} set={set} />
//             <Bound label="Age (days)" minKey="ageMin" maxKey="ageMax" f={draft} set={set} />
//             <div className="md:col-span-2">
//               <label className="mb-[5px] block text-[12.5px] text-ink">Search</label>
//               <input
//                 className="f-input"
//                 placeholder="Item code, name or barcode"
//                 value={draft.search}
//                 onChange={(e) => set('search', e.target.value)}
//                 onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
//               />
//             </div>
//           </div>

//           <div className="mt-4 flex items-center gap-2">
//             <span className="flex-1" />
//             <button type="button" className="btn" onClick={reset}>
//               <Icon name="refresh" size={14} /> Reset
//             </button>
//             <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>
//               {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
//             </button>
//           </div>
//         </div>
//       </div>

//       <div className="mb-3 mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
//         {tiles.map((t) => (
//           <div key={t.label} className="rounded-lg border border-line bg-white px-3 py-3">
//             <small className="block text-[11.5px] uppercase tracking-wide text-[#5d6b83]">{t.label}</small>
//             <b className="text-[20px]">{t.value}</b>
//           </div>
//         ))}
//       </div>

//       <div className="mb-3 flex flex-wrap items-center gap-2.5">
//         <span className="text-[13.5px] font-semibold">Total Products {total}</span>
//         <span className="flex-1" />
//         <label className="flex items-center gap-2 text-[12.5px] text-inkmuted">
//           Sort
//           <select
//             className="f-input !w-[220px]"
//             value={sort}
//             onChange={(e) => { setSort(e.target.value); setPage(1); }}
//           >
//             {SORTS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
//           </select>
//         </label>
//         <button type="button" className="btn" onClick={exportCsv} disabled={!cards.length}>
//           <Icon name="file" size={14} /> Export CSV
//         </button>
//       </div>

//       {loading && <div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}

//       {!loading && cards.length === 0 && (
//         <div className="card"><div className="card-body dt-empty">No data found</div></div>
//       )}

//       {!loading && cards.length > 0 && (
//         <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
//           {cards.map((c) => (
//             <Card key={(c.itemId || c.itemCode) + '|' + c.itemName} card={c} onOpen={setOpen} />
//           ))}
//         </div>
//       )}

//       {data && (
//         <NumberedPager
//           page={Number(data.page) || 1}
//           pages={pages}
//           total={total}
//           shown={shown}
//           perPage={perPage}
//           onPage={(n) => setPage(n)}
//           onPerPage={(n) => { setPerPage(n); setPage(1); }}
//         />
//       )}

//       {open && <UnitsDrawer card={open} business={business} onClose={() => setOpen(null)} />}
//     </>
//   );
// }


export default function StockGallery({ stockImageReport = false }) {
  const { business, location, finYear, isLocationLocked } = useScope();

  const [draft, setDraft] = useState(stockImageReport ? IMAGE_REPORT_BLANK : BLANK);
  const [applied, setApplied] = useState(stockImageReport ? null : BLANK);
  const [sort, setSort] = useState('value');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const locations = useOptions('companylocations', '', Boolean(business));
  const groups = useOptions(
    stockImageReport ? 'product/group-parent' : 'product/group',
    '',
    Boolean(business)
  );
  const subgroups = useOptions(
    'product/group',
    '',
    Boolean(stockImageReport && business && draft.groupId),
    stockImageReport && draft.groupId ? { parentId: draft.groupId } : null
  );
  const items = useOptions(
    'item',
    '',
    Boolean(business),
    stockImageReport && draft.subGroupId
      ? { groupId: draft.subGroupId }
      : stockImageReport && draft.groupId
        ? { parentGroupId: draft.groupId }
        : null
  );
  const suppliers = useOptions('supplier', '', Boolean(business));

  const query = useCallback((pg) => {
    const q = new URLSearchParams({
      business: business || '',
      location: location || '',
      finYear: finYear || '',
      page: String(pg),
      perPage: String(perPage),
      sort,
    });
    /* the screen's own Location filter says All Locations */
    if (stockImageReport) q.set('screen', 'stock-image');
    if (!isLocationLocked && !applied?.location) q.set('allLocations', '1');
    Object.entries(applied || {}).forEach(([k, v]) => {
      if (k === 'age') return;
      if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); }
      else if (String(v || '').trim()) q.set(k, v);
    });
    const ageRange = AGE_FILTERS.find((range) => range.value === applied?.age);
    if (ageRange) {
      q.set('ageMin', String(ageRange.min));
      if (ageRange.max !== undefined) q.set('ageMax', String(ageRange.max));
    }
    return q.toString();
  }, [business, location, finYear, perPage, sort, applied, stockImageReport]);

  useEffect(() => {
    if (!business || (stockImageReport && !applied)) {
      setData(null);
      setLoading(false);
      return undefined;
    }
    let off = false;
    setLoading(true);
    setError('');
    fetch('/api/reports/stock-gallery?' + query(page), { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) { setError(d.error || 'Could not run that report.'); setData(null); return; }
        setData(d);
      })
      .catch(() => { if (!off) { setError('Could not reach the server.'); setData(null); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [business, query, page, applied, stockImageReport]);

  const cards = data?.sections?.[0]?.rows || [];
  const total = Number(data?.total) || 0;
  const pages = Number(data?.pages) || 1;
  const shown = Math.max(0, Math.min(perPage, total - (page - 1) * perPage));

  function search() {
    if (stockImageReport) {
      for (const [label, minKey, maxKey] of [
        ['QOH', 'qohMin', 'qohMax'],
        ['RSP', 'rspMin', 'rspMax'],
        ['Purchase Rate', 'rateMin', 'rateMax'],
      ]) {
        const minText = String(draft[minKey] || '').trim();
        const maxText = String(draft[maxKey] || '').trim();
        const min = Number(minText);
        const max = Number(maxText);
        if ((minText && (!Number.isFinite(min) || min < 0))
          || (maxText && (!Number.isFinite(max) || max < 0))) {
          setError(`${label} must use non-negative numbers.`);
          return;
        }
        if (minText && maxText && min > max) {
          setError(`${label} Start must be less than or equal to End.`);
          return;
        }
      }
    }
    setError('');
    setApplied({ ...draft });
    setPage(1);
  }
  function reset() {
    const next = stockImageReport ? IMAGE_REPORT_BLANK : BLANK;
    setDraft(next);
    setApplied(stockImageReport ? null : BLANK);
    setSort('value');
    setPage(1);
    setError('');
  }

  function exportCsv() {
    const headers = ['Item Code', 'Item Name', 'Group', 'Sub Group', 'Supplier', 'QOH', 'Purchase Rate', 'RSP', 'Stock Value', 'Age'];
    const rows = cards.map((c) => [
      c.itemCode, c.itemName, c.groupName, c.subGroupName, c.supplier,
      c.qoh, c.purchaseRate.toFixed(2), c.rsp.toFixed(2), c.stockValue.toFixed(2),
      c.age === null ? '' : c.age,
    ]);
    download('stock-gallery.csv', toCsv(headers, rows), 'text/csv');
  }

  const tiles = useMemo(() => ([
    { label: 'Total Products', value: fmt('count', data?.tiles?.totalProducts ?? 0) },
    { label: 'Total Quantity', value: fmt('amount', data?.tiles?.totalQty ?? 0) },
    { label: 'Total Stock Value', value: fmt('amount', data?.tiles?.totalValue ?? 0) },
  ]), [data]);

  return (
    <>
      {stockImageReport ? (
        <section className="card">
          <header className="card-head">
            <span className="card-title"><Icon name="image" size={16} /> Stock Image Report</span>
          </header>
          <div className="card-body">
            {error && <div className="flash flash-err mb-3">{error}</div>}
            {!business && <div className="flash flash-err mb-3">Select a business in the top bar.</div>}
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <ReportField label="Location">
                <MultiSelect
                  mode="single"
                  options={locations.options}
                  loading={locations.loading}
                  disabled={isLocationLocked}
                  value={isLocationLocked ? (location || locations.options[0]?.value || '') : draft.location}
                  placeholder={isLocationLocked ? (locations.options[0]?.label || 'Assigned Location') : 'Select...'}
                  onChange={isLocationLocked ? () => {} : (v) => set('location', v)}
                />
              </ReportField>
              <ReportField label="Group Name">
                <MultiSelect
                  mode="single"
                  options={groups.options}
                  loading={groups.loading}
                  value={draft.groupId}
                  placeholder="Select..."
                  onChange={(v) => setDraft((current) => ({
                    ...current, groupId: v, subGroupId: '', itemId: '',
                  }))}
                />
              </ReportField>
              <ReportField label="Subgroup Name">
                <MultiSelect
                  mode="single"
                  options={subgroups.options.filter((option) => option.value !== draft.groupId)}
                  loading={subgroups.loading}
                  value={draft.subGroupId}
                  placeholder="Select..."
                  onChange={(v) => setDraft((current) => ({
                    ...current, subGroupId: v, itemId: '',
                  }))}
                />
              </ReportField>
              <ReportField label="Items">
                <MultiSelect
                  mode="single"
                  options={items.options}
                  loading={items.loading}
                  value={draft.itemId}
                  placeholder="Select..."
                  onChange={(v) => set('itemId', v)}
                />
              </ReportField>
              <Bound label="QOH" minKey="qohMin" maxKey="qohMax" f={draft} set={set} startEnd />
              <Bound label="RSP Filter" minKey="rspMin" maxKey="rspMax" f={draft} set={set} startEnd />
              <Bound label="Purchase Rate Filter" minKey="rateMin" maxKey="rateMax" f={draft} set={set} startEnd />
              <ReportField label="Age">
                <select
                  className="f-input"
                  value={draft.age}
                  onChange={(event) => set('age', event.target.value)}
                >
                  <option value="">Select...</option>
                  {AGE_FILTERS.map((range) => (
                    <option key={range.value} value={range.value}>{range.label}</option>
                  ))}
                </select>
              </ReportField>
              <ReportField label="Supplier">
                <MultiSelect
                  mode="single"
                  options={suppliers.options}
                  loading={suppliers.loading}
                  value={draft.supplierId}
                  placeholder="Select Supplier"
                  onChange={(v) => set('supplierId', v)}
                />
              </ReportField>
            </div>
            <div className="mt-3 flex justify-center border-t border-line pt-3">
              <button type="button" className="btn btn-primary min-w-[155px]" onClick={search} disabled={loading || !business}>
                {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="mb-3">
            <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
              <Icon name="grid" size={18} /> Stock Gallery View
            </h2>
            <p className="text-[13px] text-inkmuted">
              Every item currently in stock, as a card - quantity, cost, RSP, value and age, with its own photo where one exists.
            </p>
          </div>
          <div className="card">
            <div className="card-body">
              {error && <div className="flash flash-err">{error}</div>}
              {!business && <div className="flash flash-err">Select a business in the top bar.</div>}
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
                <ReportField label="Business Location">
                  <MultiSelect
                    mode="single"
                    options={locations.options}
                    loading={locations.loading}
                    value={draft.location}
                    placeholder="All Locations"
                    onChange={(v) => set('location', v)}
                  />
                </ReportField>
                <ReportField label="Group / Sub Group">
                  <MultiSelect
                    mode="single"
                    options={groups.options}
                    loading={groups.loading}
                    value={draft.groupId}
                    placeholder="All Groups"
                    onChange={(v) => set('groupId', v)}
                  />
                </ReportField>
                <ReportField label="Items">
                  <MultiSelect
                    mode="multi"
                    options={items.options}
                    loading={items.loading}
                    value={draft.itemId}
                    placeholder="Type to search"
                    onChange={(v) => set('itemId', v)}
                  />
                </ReportField>
                <ReportField label="Supplier">
                  <MultiSelect
                    mode="multi"
                    options={suppliers.options}
                    loading={suppliers.loading}
                    value={draft.supplierId}
                    placeholder="Type to search"
                    onChange={(v) => set('supplierId', v)}
                  />
                </ReportField>
                <Bound label="QOH" minKey="qohMin" maxKey="qohMax" f={draft} set={set} />
                <Bound label="RSP" minKey="rspMin" maxKey="rspMax" f={draft} set={set} />
                <Bound label="Purchase Rate" minKey="rateMin" maxKey="rateMax" f={draft} set={set} />
                <Bound label="Age (days)" minKey="ageMin" maxKey="ageMax" f={draft} set={set} />
                <div className="md:col-span-2">
                  <label className="mb-[5px] block text-[12.5px] text-ink">Search</label>
                  <input
                    className="f-input"
                    placeholder="Item code, name or barcode"
                    value={draft.search}
                    onChange={(e) => set('search', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex-1" />
                <button type="button" className="btn" onClick={reset}>
                  <Icon name="refresh" size={14} /> Reset
                </button>
                <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>
                  {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {!stockImageReport && (
        <div className="mb-3 mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-line bg-white px-3 py-3">
              <small className="block text-[11.5px] uppercase tracking-wide text-[#5d6b83]">{t.label}</small>
              <b className="text-[20px]">{t.value}</b>
            </div>
          ))}
        </div>
      )}

      {(!stockImageReport || applied) && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="text-[13.5px] font-semibold">Total Products {total}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[12.5px] text-inkmuted">
          Sort
          <select
            className="f-input !w-[220px]"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            {SORTS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={exportCsv} disabled={!cards.length}>
          <Icon name="file" size={14} /> Export CSV
        </button>
        </div>
      )}

      {loading && <div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}

      {!loading && (!stockImageReport || applied) && cards.length === 0 && (
        <div className="card">
          <div className="card-body dt-empty">
            {stockImageReport ? 'No stock items match these filters.' : 'No data found'}
          </div>
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((c) => (
            <Card key={(c.itemId || c.itemCode) + '|' + c.itemName} card={c} onOpen={setOpen} />
          ))}
        </div>
      )}

      {data && (
        <NumberedPager
          page={Number(data.page) || 1}
          pages={pages}
          total={total}
          shown={shown}
          perPage={perPage}
          onPage={(n) => setPage(n)}
          onPerPage={(n) => { setPerPage(n); setPage(1); }}
        />
      )}

      {open && (
        <UnitsDrawer
          card={open}
          business={business}
          location={applied?.location || location}
          finYear={finYear}
          allLocations={!isLocationLocked && !applied?.location}
          stockImageReport={stockImageReport}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
