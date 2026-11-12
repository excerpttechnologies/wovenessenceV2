'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* ==========================================================================
   Barcode Merge - the creation screen.

   The operator scans source barcodes. Every change is validated by the
   server, which answers with the compatible sources and the converted total -
   or with the exact reason a source cannot join. Prices for the merged
   barcode are entered and confirmed; source prices are preserved, never
   averaged.
   ========================================================================== */

const inputCls =
  'w-full rounded-md border border-line bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-inkmuted';

const priceFields = [
  ['purchaseRate', 'Purchase Rate'],
  ['discount', 'Discount'],
  ['finalPurchaseRate', 'Final Purchase Rate'],
  ['rsp', 'RSP'],
  ['rspOfferPrice', 'RSP Offer Price'],
  ['wsp', 'WSP'],
  ['wspOfferPrice', 'WSP Offer Price'],
  ['dp', 'DP'],
  ['dpOfferPrice', 'DP Offer Price'],
  ['sellingPrice', 'SP'],
];

export default function BarcodeMergeForm({ draftId = null }) {
  const router = useRouter();
  const { business, location, finYear } = useScope();
  const fileRef = useRef(null);

  const [scan, setScan] = useState('');
  const [codes, setCodes] = useState([]);
  const [draftNo, setDraftNo] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [sources, setSources] = useState([]);
  const [uom, setUom] = useState('');
  const [prices, setPrices] = useState({});
  const [notes, setNotes] = useState('');
  const [totalQty, setTotalQty] = useState(0);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const firstSource = sources[0] || null;

  /* Edit mode: load the draft's own sources and approved prices, then
     re-validate them so the screen shows the same snapshots finalize will
     read. The merged barcode number is already reserved and stays fixed. */
  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;

    (async () => {
      setLoadingDraft(true);
      setError('');
      try {
        const qs = business ? '?business=' + business : '';
        const res = await fetch('/api/barcode-merge/' + draftId + qs, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load this draft merge.');
        const merge = data.merge;
        if (!merge) throw new Error('This merge no longer exists.');
        if (merge.status !== 'Draft') {
          throw new Error('Only a draft merge can be edited. This one is ' + merge.status + '.');
        }
        if (cancelled) return;

        const list = (merge.sources || []).map((s) => s.barcodeNo).filter(Boolean);
        setCodes(list);
        setUom(merge.uom || '');
        setNotes(merge.notes || '');
        setDraftNo(merge.mergedBarcodeNo || '');
        setPrices(Object.fromEntries(priceFields.map(([key]) => [key, merge[key] ?? ''])));

        if (list.length >= 2) {
          const vres = await fetch('/api/barcode-merge/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business, barcodes: list, uom: merge.uom || '' }),
          });
          const vdata = await vres.json().catch(() => ({}));
          if (!vres.ok) throw new Error(vdata.error || 'The draft sources could not be validated.');
          if (cancelled) return;
          setSources(vdata.sources || []);
          setTotalQty(Number(vdata.totalQty) || 0);
          setIssues(vdata.errors || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();

    return () => { cancelled = true; };
  }, [draftId, business]);

  async function validate(nextCodes, nextUom) {
    const list = Array.isArray(nextCodes) ? nextCodes : codes;
    setError('');
    setIssues([]);

    if (list.length < 2) {
      setSources([]);
      setTotalQty(0);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/barcode-merge/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, barcodes: list, uom: nextUom || uom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The selected barcodes could not be validated.');

      setSources(data.sources || []);
      setTotalQty(Number(data.totalQty) || 0);
      if (!nextUom && !uom && data.uom) setUom(data.uom);
      setIssues(data.errors || []);
    } catch (err) {
      setError(err.message);
      setSources([]);
      setTotalQty(0);
    } finally {
      setBusy(false);
    }
  }

  /* Prepopulate the merged prices from the common source's context once, so
     the operator confirms rather than types blind. Prices remain editable and
     are never silently taken from an average. */
  useEffect(() => {
    const source = sources[0];
    if (!source) return;
    setPrices((current) => (Object.keys(current).length ? current : {
      purchaseRate: source.purchaseRate || '',
      discount: source.discount || 0,
      finalPurchaseRate: source.finalPurchaseRate || '',
      rsp: source.rsp || '',
      rspOfferPrice: source.rspOfferPrice || 0,
      wsp: source.wsp || '',
      wspOfferPrice: source.wspOfferPrice || 0,
      dp: source.dp || '',
      dpOfferPrice: source.dpOfferPrice || 0,
      sellingPrice: source.sellingPrice || '',
    }));
  }, [sources]);

  function addCode(event) {
    event?.preventDefault?.();
    const value = scan.trim();
    if (!value) return;
    if (codes.some((c) => c.toUpperCase() === value.toUpperCase())) {
      setError('Barcode ' + value + ' is already in this merge.');
      setScan('');
      return;
    }
    const next = [...codes, value];
    setCodes(next);
    setScan('');
    validate(next);
  }

  function removeCode(code) {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    setPrices({});
    validate(next);
  }

  async function changeUom(nextUom) {
    setUom(nextUom);
    await validate(codes, nextUom);
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setIssues([]);
    setMessage('');
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const rows = raw.map((row, index) => ({
        row: index + 2,
        mergeGroup: String(row['Merge Group'] || row.mergeGroup || '1').trim() || '1',
        barcodeNo: String(row['Source Barcode'] || row.barcodeNo || row.barcode || '').trim(),
        mergedUom: String(row['Merged UOM'] || row.uom || '').trim(),
        purchaseRate: row['Purchase Rate'] ?? row.purchaseRate,
        discount: row.Discount ?? row.discount,
        finalPurchaseRate: row['Final Purchase Rate'] ?? row.finalPurchaseRate,
        rsp: row.RSP ?? row.rsp,
        rspOfferPrice: row['RSP Offer Price'] ?? row.rspOfferPrice,
        wsp: row.WSP ?? row.wsp,
        wspOfferPrice: row['WSP Offer Price'] ?? row.wspOfferPrice,
        dp: row.DP ?? row.dp,
        dpOfferPrice: row['DP Offer Price'] ?? row.dpOfferPrice,
        sellingPrice: row.SP ?? row.sellingPrice,
      })).filter((r) => r.barcodeNo);

      if (!rows.length) throw new Error('The first sheet has no Source Barcode values.');

      const res = await fetch('/api/barcode-merge/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The file could not be validated.');

      if (data.errors?.length) {
        setIssues(data.errors);
        return;
      }
      const group = data.groups?.[0];
      if (!group) throw new Error('No merge group could be read from the file.');
      if (data.groups.length > 1) {
        throw new Error('The file contains more than one merge group. Import one group at a time.');
      }
      if (group.errors?.length) {
        setIssues(group.errors);
        return;
      }

      const next = group.sources.map((s) => s.barcodeNo);
      setCodes(next);
      setSources(group.sources);
      setTotalQty(group.totalQty);
      const fileUom = group.uom || rows[0]?.mergedUom || '';
      setUom(fileUom);
      setPrices({
        purchaseRate: rows[0]?.purchaseRate ?? '',
        discount: rows[0]?.discount ?? 0,
        finalPurchaseRate: rows[0]?.finalPurchaseRate ?? '',
        rsp: rows[0]?.rsp ?? '',
        rspOfferPrice: rows[0]?.rspOfferPrice ?? 0,
        wsp: rows[0]?.wsp ?? '',
        wspOfferPrice: rows[0]?.wspOfferPrice ?? 0,
        dp: rows[0]?.dp ?? '',
        dpOfferPrice: rows[0]?.dpOfferPrice ?? 0,
        sellingPrice: rows[0]?.sellingPrice ?? '',
      });
      setMessage('Loaded merge group with ' + next.length + ' source barcode(s). Review and confirm.');
    } catch (err) {
      setIssues([{ row: 0, message: err.message }]);
    } finally {
      event.target.value = '';
    }
  }

  async function downloadTemplate() {
    const qs = business ? '?business=' + business : '';
    const res = await fetch('/api/barcode-merge/import/template' + qs);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not download the template.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Barcode_Merge_Import_Template.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function clientIssues() {
    const out = [];
    if (codes.length < 2) out.push('Select at least two source barcodes.');
    if (!uom) out.push('Choose the merged UOM.');
    if (!(Number(prices.purchaseRate) > 0)) out.push('Enter the approved purchase rate.');
    if (!(Number(prices.rsp) > 0)) out.push('Enter the approved RSP.');
    priceFields.forEach(([key, label]) => {
      if (Number(prices[key]) < 0) out.push(label + ' cannot be negative.');
    });
    return out;
  }

  async function save(finalize) {
    const problems = clientIssues();
    if (problems.length) {
      setIssues(problems.map((message) => ({ row: 0, message })));
      return;
    }
    if (finalize && !window.confirm('Finalize this merge? Source barcodes will be consumed and the merged barcode created in stock.')) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        business,
        location,
        finYear,
        barcodeIds: sources.map((s) => s.barcodeId),
        barcodes: codes,
        uom,
        notes,
        finalize,
        mergedBarcodeNo: prices.mergedBarcodeNo || '',
        ...Object.fromEntries(priceFields.map(([key]) => [key, Number(prices[key]) || 0])),
      };
      if (draftId) {
        /* Save the edit first: finalize reads the stored draft, so posting
           it before the update would merge the old prices and sources. */
        const res = await fetch('/api/barcode-merge/' + draftId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, business, action: 'update' }),
        });
        const data = await res.json();
        if (!res.ok) {
          const rows = Array.isArray(data.errors) ? data.errors : [];
          setIssues(rows.map((r) => ({ row: r.row, message: r.message })));
          throw new Error(data.error || 'The draft could not be updated.');
        }
        if (finalize) {
          const fres = await fetch('/api/barcode-merge/' + draftId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'finalize', business }),
          });
          const fdata = await fres.json().catch(() => ({}));
          if (!fres.ok) throw new Error(fdata.error || 'The merge could not be finalized.');
        }
        router.push('/admin/tools/barcode-merge/' + draftId);
        return;
      }

      const res = await fetch('/api/barcode-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const rows = Array.isArray(data.errors) ? data.errors : [];
        setIssues(rows.map((r) => ({ row: r.row, message: r.message })));
        throw new Error(data.error || 'The merge could not be saved.');
      }
      router.push('/admin/tools/barcode-merge/' + data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingDraft) {
    return (
      <div className="card">
        <div className="card-body flex items-center gap-2 text-[13px] text-inkmuted">
          <span className="spin" /> Loading draft merge...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="barcode" size={16} /> 1. Select Source Barcodes</span>
          <span className="card-sub">Scan or type each barcode, then press Enter</span>
        </div>
        <div className="card-body space-y-3">
          <form onSubmit={addCode} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <label className={labelCls}>Barcode</label>
              <input className={inputCls} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan a source barcode" autoFocus />
            </div>
            <button type="submit" className="btn btn-primary h-[36px]"><Icon name="plus" size={14} /> Add</button>
            <button type="button" className="btn btn-ghost h-[36px]" onClick={downloadTemplate}><Icon name="download" size={14} /> Template</button>
            <label className="btn btn-ghost h-[36px] cursor-pointer">
              <Icon name="upload" size={14} /> Import
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
            </label>
          </form>

          <div className="flex flex-wrap gap-2">
            {codes.map((code) => (
              <span key={code} className="inline-flex items-center gap-2 rounded-full border border-line bg-rowalt px-3 py-1 text-[12.5px]">
                {code}
                <button type="button" className="text-danger" onClick={() => removeCode(code)} title="Remove">
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
            {!codes.length && <span className="text-[12.5px] text-inkmuted">No barcodes selected.</span>}
          </div>

          {busy && <p className="text-[12.5px] text-inkmuted">Validating selected barcodes...</p>}
          {error && <div className="rounded-md border border-[#f3b4b0] bg-[#fdeeed] px-3 py-2 text-[13px] text-danger">{error}</div>}
          {message && <p className="text-[12.5px] text-inkmuted">{message}</p>}
          {issues.length > 0 && (
            <div className="rounded-md border border-[#f3b4b0] bg-[#fdeeed] p-3 text-[12.5px] text-danger">
              <b>Compatibility problems</b>
              <ul className="mt-1 list-disc pl-5">
                {issues.slice(0, 20).map((issue, index) => <li key={index}>{issue.row ? 'Row ' + issue.row + ': ' : ''}{issue.message}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {sources.length > 0 && (
        <>
          <div className="card">
            <div className="card-head">
              <span className="card-title">2. Source Barcode Details</span>
              <span className="card-sub">{sources.length} compatible source(s)</span>
            </div>
            <div className="card-body overflow-x-auto">
              <table className="dt min-w-[1250px]">
                <thead>
                  <tr>
                    <th>#</th><th>Barcode</th><th>Item Code</th><th>Item Name</th>
                    <th>Available Qty</th><th>UOM</th><th>Conversion</th><th>In Merged UOM</th>
                    <th>Supplier</th><th>GRC Reference</th><th>Batch</th>
                    <th>Purchase Rate</th><th>RSP</th><th>WSP</th><th>DP</th><th>SP</th>
                    <th>HSN</th><th>GST</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source, index) => (
                    <tr key={source.barcodeId}>
                      <td>{index + 1}</td>
                      <td className="font-semibold">{source.barcodeNo}</td>
                      <td>{source.itemCode}</td>
                      <td>{source.itemName}</td>
                      <td>{source.qty}</td>
                      <td>{source.uom}</td>
                      <td>{Number(source.conversionFactor) === 1 ? '1:1' : '×' + source.conversionFactor}</td>
                      <td className="font-semibold">{source.qtyInMergedUom}</td>
                      <td>{source.supplierId ? 'Inherited' : '—'}</td>
                      <td>{source.grcNo || '—'}</td>
                      <td>{source.batchNo || '—'}</td>
                      <td>{source.purchaseRate}</td>
                      <td>{source.rsp}</td>
                      <td>{source.wsp}</td>
                      <td>{source.dp}</td>
                      <td>{source.sellingPrice}</td>
                      <td>{source.hsn || '—'}</td>
                      <td>{source.gst || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">3. Merged Barcode &amp; Approved Prices</span></div>
            <div className="card-body space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className={labelCls}>Merged UOM</label>
                  <select className={inputCls + ' w-[140px]'} value={uom} onChange={(e) => changeUom(e.target.value)}>
                    <option value="">Select</option>
                    <option value="MTR">MTR</option>
                    <option value="PCS">PCS</option>
                    {firstSource?.uom && !['MTR', 'PCS'].includes(firstSource.uom) && <option value={firstSource.uom}>{firstSource.uom}</option>}
                  </select>
                </div>
                <div className="rounded-md border border-line bg-rowalt px-4 py-2">
                  <span className={labelCls}>Total Merged Quantity</span>
                  <b className="text-[15px]">{totalQty} {uom}</b>
                </div>
                <div>
                  <label className={labelCls}>{draftId ? 'Merged Barcode No' : 'Merged Barcode No (optional)'}</label>
                  {draftId ? (
                    <input className={inputCls + ' w-[180px] bg-rowalt'} value={draftNo} readOnly title="Reserved when the draft was created" />
                  ) : (
                    <input className={inputCls + ' w-[180px]'} placeholder="Auto-generate" value={prices.mergedBarcodeNo || ''} onChange={(e) => setPrices((p) => ({ ...p, mergedBarcodeNo: e.target.value }))} />
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="dt min-w-[1000px]">
                  <thead><tr>{priceFields.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
                  <tbody>
                    <tr>
                      {priceFields.map(([key]) => (
                        <td key={key}>
                          <input
                            className={inputCls + ' min-w-[92px]'}
                            type="number"
                            min="0"
                            step="0.01"
                            value={prices[key] ?? ''}
                            onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value }))}
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] text-inkmuted">
                These prices apply to the merged barcode. The sources&apos; own prices are stored unchanged on the merge document - nothing is averaged.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">4. Merge Summary</span></div>
            <div className="card-body">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-line bg-rowalt p-4 text-[13px]">
                  <div className="grid grid-cols-2 gap-2">
                    <span>Merged Barcode</span><b>{draftId ? draftNo : (prices.mergedBarcodeNo || 'Issued on save')}</b>
                    <span>Source Barcodes</span><b>{sources.length}</b>
                    <span>Total Quantity</span><b>{totalQty} {uom}</b>
                    <span>Item</span><b>{firstSource?.itemCode} {firstSource?.itemName}</b>
                    <span>Supplier</span><b>Inherited</b>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea className={inputCls + ' min-h-[92px]'} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks for this merge" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => router.push(draftId ? '/admin/tools/barcode-merge/' + draftId : '/admin/tools/barcode-merge')} disabled={saving}>Cancel</button>
                <button type="button" className="btn" onClick={() => save(false)} disabled={saving}><Icon name="save" size={14} /> {draftId ? 'Update Draft' : 'Save as Draft'}</button>
                <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving}><Icon name="check" size={14} /> {saving ? 'Saving...' : 'Finalize Merge'}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
