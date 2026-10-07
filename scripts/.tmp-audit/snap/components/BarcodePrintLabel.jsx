// 'use client';
// import { useCallback, useEffect, useState } from 'react';
// import { useSearchParams } from 'next/navigation';
// import Icon from './Icon';
// import MultiSelect from './MultiSelect';
// import { useScope } from './ScopeContext';
// import { useOptions } from './useOptions';

// /* Barcode Print Label.

//    Reached two ways:
//      - Action ▾ -> Barcode Print on the GRC list, which arrives as ?grc=<id>
//        and prefills the rows from that challan's items
//      - directly from the sidebar, where rows are added by scanning

//    "Barcode Copies + Apply" sets every row at once; "Copy Quantity to Barcode
//    Copies" pulls each row's own quantity across. */

// const n = (v, dp = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(dp));

// export default function BarcodePrintLabel() {
//   const sp = useSearchParams();
//   const grcId = sp.get('grc');
//   const scope = useScope();

//   /* the barcode SETTINGS master, not the label choice-table */
//   const { options, loading } = useOptions('barcodesetting');

//   const [settingId, setSettingId] = useState('');
//   const [rows, setRows] = useState([]);
//   const [bulkCopies, setBulkCopies] = useState(1);
//   const [scan, setScan] = useState('');
//   const [status, setStatus] = useState(null);
//   const [busy, setBusy] = useState(false);

//   /* ---------------------------------------------------- prefill from GRC -- */
//   useEffect(() => {
//     if (!grcId) return;
//     setBusy(true);

//     fetch('/api/purchase-grc/' + grcId + '/print')
//       .then(async (r) => {
//         if (!r.ok) throw new Error('Could not load that challan');
//         return r.json();
//       })
//       .then((d) => {
//         setRows((d.items || []).map((r) => ({
//           itemName: r.itemName,
//           itemCode: r.batchNo,
//           quantity: r.qty,
//           rsp: r.rsp,
//           wsp: r.wsp ?? '',
//           copies: 1,
//         })));
//         if (!(d.items || []).length) setStatus('That challan has no line items.');
//       })
//       .catch((e) => setStatus(e.message))
//       .finally(() => setBusy(false));
//   }, [grcId]);

//   /* --------------------------------------------------------------- scan --- */
//   const addScanned = useCallback(async (code) => {
//     if (!code.trim()) return;
//     setScan('');

//     try {
//       const r = await fetch('/api/item?perPage=1&search=' + encodeURIComponent(code.trim())
//         + '&business=' + (scope.business || ''));
//       const d = await r.json();
//       const hit = (d.rows || [])[0];
//       if (!hit) { setStatus('No item matches ' + code); return; }

//       setRows((prev) => [...prev, {
//         itemName: hit.name || '',
//         itemCode: hit.itemCode || code.trim(),
//         quantity: 0,
//         rsp: hit.rsp ?? '',
//         wsp: hit.wsp ?? '',
//         copies: 1,
//       }]);
//       setStatus(null);
//     } catch {
//       setStatus('Lookup failed');
//     }
//   }, [scope.business]);

//   const setCopies = (i, v) =>
//     setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, copies: v } : r)));

//   const applyToAll = () =>
//     setRows((prev) => prev.map((r) => ({ ...r, copies: Number(bulkCopies) || 0 })));

//   const copyQuantity = () =>
//     setRows((prev) => prev.map((r) => ({ ...r, copies: Number(r.quantity) || 0 })));

//   const preview = () => {
//     if (!settingId) { setStatus('Pick a barcode setting first.'); return; }
//     if (!rows.length) { setStatus('Nothing to preview.'); return; }
//     setStatus(null);
//     window.print();
//   };

//   const totalLabels = rows.reduce((a, r) => a + (Number(r.copies) || 0), 0);

//   return (
//     <div className="card">
//       <div className="card-head">
//         <span className="card-title">Barcode Print Label</span>
//       </div>

//       <div className="card-body">
//         {status && <div className="flash flash-err no-print">{status}</div>}

//         {/* setting + preview */}
//         <div className="no-print grid grid-cols-1 gap-4 md:grid-cols-3">
//           <div className="md:col-span-2">
//             <label className="f-label">Barcode setting</label>
//             <MultiSelect
//               mode="single"
//               options={options}
//               loading={loading}
//               value={settingId}
//               placeholder="Select..."
//               onChange={setSettingId}
//             />
//           </div>
//           <div className="flex items-end">
//             <button type="button" className="btn btn-primary h-[38px] w-full justify-center" onClick={preview}>
//               Preview
//             </button>
//           </div>
//         </div>

//         {/* copies controls */}
//         <div className="no-print mt-4 flex flex-wrap items-center gap-3">
//           <span className="text-[13px]">Barcode Copies</span>
//           <input
//             type="number" min="0"
//             className="f-input w-[86px]"
//             value={bulkCopies}
//             onChange={(e) => setBulkCopies(e.target.value)}
//           />
//           <button type="button" className="btn btn-primary" onClick={applyToAll}>Apply</button>
//           <span className="flex-1" />
//           <button type="button" className="btn" onClick={copyQuantity}>
//             <Icon name="file" size={13} /> Copy Quantity to Barcode Copies
//           </button>
//         </div>

//         {/* scan box - only when not driven by a GRC */}
//         {!grcId && (
//           <div className="no-print mt-3 max-w-[420px]">
//             <label className="f-label">Scan / type an item code</label>
//             <input
//               className="f-input"
//               value={scan}
//               placeholder="Scan barcode"
//               onChange={(e) => setScan(e.target.value)}
//               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addScanned(scan); } }}
//             />
//           </div>
//         )}

//         <div className="print-doc mt-4 overflow-x-auto">
//           <table className="dt">
//             <thead>
//               <tr>
//                 <th>Item Name</th>
//                 <th>Item Code</th>
//                 <th>Quantity</th>
//                 <th>RSP Price</th>
//                 <th>WSP Price</th>
//                 <th style={{ width: 130 }}>Barcode Copies</th>
//                 <th className="no-print" style={{ width: 50 }} />
//               </tr>
//             </thead>
//             <tbody>
//               {busy && <tr><td colSpan={7} className="dt-empty"><span className="spin" /></td></tr>}
//               {!busy && rows.length === 0 && (
//                 <tr><td colSpan={7} className="dt-empty">No Item Found</td></tr>
//               )}
//               {rows.map((r, i) => (
//                 <tr key={r.itemCode + i}>
//                   <td className="text-brand-link">{r.itemName}</td>
//                   <td>{r.itemCode}</td>
//                   <td>{r.quantity}</td>
//                   <td>{n(r.rsp)}</td>
//                   <td>{n(r.wsp)}</td>
//                   <td>
//                     <input
//                       type="number" min="0"
//                       className="f-input h-8 w-[80px]"
//                       value={r.copies}
//                       onChange={(e) => setCopies(i, e.target.value)}
//                     />
//                   </td>
//                   <td className="no-print">
//                     <button
//                       type="button"
//                       className="act-btn bg-danger"
//                       onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}
//                     >
//                       <Icon name="trash" size={12} />
//                     </button>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>

//         {rows.length > 0 && (
//           <div className="no-print mt-3 text-[13px] text-inkmuted">
//             {rows.length} item{rows.length === 1 ? '' : 's'} &middot; {totalLabels} label{totalLabels === 1 ? '' : 's'} to print
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }




'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import BarcodeLabelSheet from './BarcodeLabelSheet';
import { useScope } from './ScopeContext';

/* Barcode Print Label.

   Reached two ways:
     - Action ▾ -> Barcode Print on the GRC list, which arrives as ?grc=<id>
       and prefills the rows from that challan's items
     - Inventory -> Print Label in the sidebar, where rows are added by
       scanning or typing an item code

   Scanning looks in the BARCODE ROWS first (what Barcode Generation wrote),
   because those carry the real generated barcode and the GRC's pricing. Only
   if the code has never been through generation does it fall back to the item
   master, and then the item code itself is what gets encoded - there is no
   generated barcode to print yet.

   Preview renders the actual label sheet, sized from the chosen Barcode Label
   Setting, rather than printing the on-screen table. */

const n = (v, dp = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(dp));

/* one search should not be able to add a thousand lines by accident */
const MAX_ADDED = 100;

export default function BarcodePrintLabel() {
  const sp = useSearchParams();
  const grcId = sp.get('grc');
  const scope = useScope();

  /* Label FORMATS - the whole seeded catalog, which is what the deployed
     screen offers.

     Settings -> Barcode Label Settings is a choice table over the same
     catalog, but it is treated as a PREFERENCE, not a filter: the format
     ticked as Default there is preselected here. Using it to filter the
     list would mean a tenant who has ticked one format can never print any
     other, and a tenant who has ticked none gets an empty dropdown. */
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settingName, setSettingName] = useState('');

  const [rows, setRows] = useState([]);
  const [bulkCopies, setBulkCopies] = useState(1);
  const [scan, setScan] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const qs = new URLSearchParams({
        business: scope.business || '', location: scope.location || '', finYear: scope.finYear || '',
      });
      try {
        const [chosenRes, catalogRes] = await Promise.all([
          fetch('/api/barcode-label-setting?' + qs).then((r) => r.json()).catch(() => ({})),
          fetch('/api/catalog?name=barcodeLabels').then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;

        const catalog = catalogRes.rows || [];
        setFormats(catalog);

        /* preselect the format marked Default in Barcode Label Settings,
           else the first ticked one, else the first in the catalog */
        const ticked = ((chosenRes.doc && chosenRes.doc.rows) || []).filter((r) => r.choice);
        const preferred = ticked.find((t) => t.isDefault)?.name || ticked[0]?.name;
        const exists = catalog.some((c) => c.name === preferred);

        setSettingName(exists ? preferred : (catalog[0]?.name || ''));
        if (!catalog.length) {
          setStatus('No label formats found - run npm run seed to load the label catalog.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [scope.business, scope.location, scope.finYear]);

  const format = useMemo(
    () => formats.find((f) => f.name === settingName) || null,
    [formats, settingName]
  );

  /* ---------------------------------------------------- prefill from GRC -- */
  useEffect(() => {
    if (!grcId) return;
    setBusy(true);

    fetch('/api/purchase-grc/' + grcId + '/print')
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load that challan');
        return r.json();
      })
      .then((d) => {
        setRows((d.items || []).map((r) => ({
          itemName: r.itemName,
          itemCode: r.batchNo,
          quantity: r.qty,
          rsp: r.rsp,
          wsp: r.wsp ?? '',
          barcodeGenerated: '',
          copies: 1,
        })));
        if (!(d.items || []).length) setStatus('That challan has no line items.');
      })
      .catch((e) => setStatus(e.message))
      .finally(() => setBusy(false));
  }, [grcId]);

  /* --------------------------------------------------------------- scan --- */
  const addScanned = useCallback(async (raw) => {
    const code = String(raw || '').trim();
    if (!code) return;
    setScan('');
    setBusy(true);
    setStatus(null);

    try {
      /* 1. real generated barcodes for this code */
      const qs = new URLSearchParams({
        code,
        business: scope.business || '',
        location: scope.location || '',
        finYear: scope.finYear || '',
        perPage: String(MAX_ADDED),
      });
      const bres = await fetch('/api/barcode-generation?' + qs);
      const bdata = await bres.json().catch(() => ({}));
      const found = bdata.rows || [];

      if (found.length) {
        setRows((prev) => [...prev, ...found.map((r) => ({
          itemName: r.printDescription || r.supplierDescription || '',
          itemCode: r.itemCode || code,
          quantity: r.qty || '',
          rsp: r.retailPrice ?? '',
          wsp: r.wspPrice ?? '',
          offerPrice: r.offerPrice ?? '',
          printDescription: r.printDescription || '',
          barcodeGenerated: r.barcodeGenerated || '',
          copies: 1,
        }))]);
        if ((bdata.total || 0) > found.length) {
          setStatus('Showing the first ' + found.length + ' of ' + bdata.total
            + ' barcodes for that code. Narrow the search to add the rest.');
        }
        return;
      }

      /* 2. nothing generated yet - fall back to the item master. The item
            code itself is what gets encoded, since no barcode exists. */
      const ires = await fetch('/api/item?perPage=1&search=' + encodeURIComponent(code)
        + '&business=' + (scope.business || ''));
      const idata = await ires.json().catch(() => ({}));
      const hit = (idata.rows || [])[0];

      if (!hit) { setStatus('No item or barcode matches "' + code + '".'); return; }

      setRows((prev) => [...prev, {
        itemName: hit.name || '',
        itemCode: hit.itemCode || code,
        quantity: 0,
        rsp: hit.rsp ?? '',
        wsp: hit.wsp ?? '',
        barcodeGenerated: '',
        copies: 1,
      }]);
      setStatus('No barcode has been generated for "' + code
        + '" yet - the item code will be printed instead.');
    } catch {
      setStatus('Lookup failed.');
    } finally {
      setBusy(false);
    }
  }, [scope.business, scope.location, scope.finYear]);

  const setCopies = (i, v) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, copies: v } : r)));

  const applyToAll = () =>
    setRows((prev) => prev.map((r) => ({ ...r, copies: Number(bulkCopies) || 0 })));

  const copyQuantity = () =>
    setRows((prev) => prev.map((r) => ({ ...r, copies: Number(r.quantity) || 0 })));

  const totalLabels = rows.reduce((a, r) => a + (Number(r.copies) || 0), 0);

  function preview() {
    if (!settingName) { setStatus('Pick a barcode setting first.'); return; }
    if (!rows.length) { setStatus('Add at least one item first.'); return; }
    if (!totalLabels) { setStatus('Every row has Barcode Copies set to 0.'); return; }
    setStatus(null);
    setPreviewing(true);
  }

  return (
    <>
      {previewing && (
        <div className="fixed inset-0 z-50 overflow-auto bg-white">
          <div className="no-print flex items-center gap-2 border-b border-line px-5 py-3">
            <span className="text-[15px] font-bold">
              Preview &mdash; {settingName}
              <span className="ml-2 text-[12px] font-normal text-inkmuted">
                {totalLabels} label{totalLabels === 1 ? '' : 's'}
                {format?.labelSize ? ' · ' + format.labelSize : ''}
                {format?.stickerInRow ? ' · ' + format.stickerInRow + ' per row' : ''}
              </span>
            </span>
            <span className="flex-1" />
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Icon name="printer" size={14} /> Print
            </button>
            <button type="button" className="btn" onClick={() => setPreviewing(false)}>
              <Icon name="x" size={14} /> Close
            </button>
          </div>
          <div className="p-5">
            <BarcodeLabelSheet rows={rows} format={format} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title">Barcode Print Label</span>
        </div>

        <div className="card-body">
          {status && <div className="flash flash-err">{status}</div>}

          {/* setting + preview */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="f-label">Barcode setting</label>
              <MultiSelect
                mode="single"
                options={formats.map((f) => ({ value: f.name, label: f.name }))}
                loading={loading}
                value={settingName}
                placeholder="Select..."
                onChange={setSettingName}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn btn-primary h-[38px] w-full justify-center"
                onClick={preview}
              >
                Preview
              </button>
            </div>
          </div>

          {/* scan */}
          <div className="kbd-hint mt-4">
            <span className="text-danger">&#9432;</span> Shortcut: Press <span className="kbd">Enter</span> /
            <span className="kbd">F9</span> / <span className="kbd">Tab</span>
            to add item &amp; and <b>box must be in focus</b>.
          </div>
          <div className="flex max-w-[620px]">
            <input
              className="f-input rounded-r-none"
              placeholder="Enter item code"
              value={scan}
              disabled={busy}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (['Enter', 'F9', 'Tab'].includes(e.key)) { e.preventDefault(); addScanned(scan); }
              }}
            />
            <button
              type="button"
              className="btn btn-dark rounded-l-none"
              disabled={busy}
              onClick={() => addScanned(scan)}
            >
              <Icon name="search" size={14} /> Search
            </button>
          </div>

          {/* bulk copies - only once there is something to apply them to, so
              the empty screen matches the deployed one */}
          {rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[13px]">Barcode Copies</span>
              <input
                type="number" min="0"
                className="f-input w-[86px]"
                value={bulkCopies}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => setBulkCopies(e.target.value)}
              />
              <button type="button" className="btn btn-primary" onClick={applyToAll}>Apply</button>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={copyQuantity}>
                <Icon name="file" size={13} /> Copy Quantity to Barcode Copies
              </button>
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Item Code</th>
                  <th>Quantity</th>
                  <th>RSP Price</th>
                  <th>WSP Price</th>
                  <th style={{ width: 130 }}>Barcode Copies</th>
                  <th style={{ width: 70 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {busy && rows.length === 0 && (
                  <tr><td colSpan={7} className="dt-empty"><span className="spin" /></td></tr>
                )}
                {!busy && rows.length === 0 && (
                  <tr><td colSpan={7} className="dt-empty">No Item Found</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={(r.barcodeGenerated || r.itemCode) + '-' + i}>
                    <td className="text-brand-link">{r.itemName}</td>
                    <td>
                      {r.itemCode}
                      {r.barcodeGenerated && (
                        <span className="block font-mono text-[11px] text-inkmuted">
                          {r.barcodeGenerated}
                        </span>
                      )}
                    </td>
                    <td>{r.quantity}</td>
                    <td>{n(r.rsp)}</td>
                    <td>{n(r.wsp)}</td>
                    <td>
                      <input
                        type="number" min="0"
                        className="f-input h-8 w-[80px]"
                        value={r.copies}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => setCopies(i, e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="act-btn bg-danger"
                        title="Remove"
                        onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="mt-3 flex items-center text-[13px] text-inkmuted">
              <span>
                {rows.length} row{rows.length === 1 ? '' : 's'} &middot;{' '}
                {totalLabels} label{totalLabels === 1 ? '' : 's'} to print
              </span>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={() => setRows([])}>
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
