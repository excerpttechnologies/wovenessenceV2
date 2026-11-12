'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { uomTypeOf } from '@/lib/barcodeUnits';

/* ==========================================================================
   Barcode Split - the creation screen.

   Left to right, the operator picks the original barcode, sees everything
   inherited from it read-only, then enters each child's quantity, UOM and NEW
   prices. Nothing inherited can be typed over: supplier, GRC and purchase
   context come from the original and stay locked.
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

const blankLine = (original) => ({
  qty: '',
  uom: original?.uom || '',
  barcodeNo: '',
  purchaseRate: original?.purchaseRate ?? '',
  discount: original?.discount ?? 0,
  finalPurchaseRate: '',
  rsp: original?.rsp ?? '',
  rspOfferPrice: original?.rspOfferPrice ?? 0,
  wsp: original?.wsp ?? '',
  wspOfferPrice: original?.wspOfferPrice ?? 0,
  dp: original?.dp ?? '',
  dpOfferPrice: original?.dpOfferPrice ?? 0,
  sellingPrice: original?.sellingPrice ?? '',
});

const round = (value, dp = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
};

export default function BarcodeSplitForm({ draftId = '' }) {
  const router = useRouter();
  const { business, location, finYear } = useScope();
  const fileRef = useRef(null);

  const [code, setCode] = useState('');
  const [original, setOriginal] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [importIssues, setImportIssues] = useState([]);

  /* Editing an existing Draft: load its original context and its reserved
     child numbers, so saving updates that document rather than creating a
     second split and consuming another set of numbers. */
  useEffect(() => {
    if (!draftId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = business ? '?business=' + business : '';
        const res = await fetch('/api/barcode-split/' + draftId + qs, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load this draft.');
        if (data.split.status !== 'Draft') throw new Error('Only a draft split can be edited. This one is ' + data.split.status + '.');

        const origQs = new URLSearchParams({ barcodeId: data.split.originalBarcodeId });
        if (business) origQs.set('business', business);
        const origRes = await fetch('/api/barcode-split/original?' + origQs, { cache: 'no-store' });
        const orig = await origRes.json();
        if (!origRes.ok) throw new Error(orig.error || 'Could not load the original barcode.');
        if (cancelled) return;

        setCode(data.split.originalBarcodeNo || '');
        setOriginal(orig.original);
        setConversions(orig.conversions || []);
        setNotes(data.split.notes || '');
        setLines((data.split.lines || []).map((line) => ({
          qty: line.qty,
          uom: line.uom,
          barcodeNo: line.childBarcodeNo || '',
          purchaseRate: line.purchaseRate,
          discount: line.discount,
          finalPurchaseRate: line.finalPurchaseRate,
          rsp: line.rsp,
          rspOfferPrice: line.rspOfferPrice,
          wsp: line.wsp,
          wspOfferPrice: line.wspOfferPrice,
          dp: line.dp,
          dpOfferPrice: line.dpOfferPrice,
          sellingPrice: line.sellingPrice,
        })));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId, business]);

  const uomOptions = useMemo(() => {
    const set = new Set(['PCS', 'MTR']);
    if (original?.uom) set.add(original.uom);
    conversions.forEach((c) => { if (c.fromUom) set.add(c.fromUom); if (c.toUom) set.add(c.toUom); });
    return [...set];
  }, [original, conversions]);

  const conversionFor = (fromUom, toUom) => {
    if (!fromUom || !toUom) return null;
    const fromType = uomTypeOf(fromUom);
    const toType = uomTypeOf(toUom);
    if (fromType === toType) return { factor: 1, sameCategory: true };

    const itemId = String(original?.itemId || '');
    const matches = (a, b) => uomTypeOf(a) === fromType && uomTypeOf(b) === toType;
    const direct = conversions.filter((c) => matches(c.fromUom, c.toUom));
    const reverse = conversions.filter((c) => matches(c.toUom, c.fromUom));

    const preferred = (list) => list.find((c) => c.itemId && String(c.itemId) === itemId)
      || list.find((c) => !c.itemId)
      || null;

    const row = preferred(direct);
    if (row && Number(row.factor) > 0) return { factor: Number(row.factor), sameCategory: false };
    const rev = preferred(reverse);
    if (rev && Number(rev.factor) > 0) return { factor: 1 / Number(rev.factor), sameCategory: false };
    return null;
  };

  const qtyInOriginalUom = (line) => {
    const qty = Number(line.qty) || 0;
    if (!qty || !line.uom || !original?.uom) return 0;
    const conv = conversionFor(line.uom, original.uom);
    if (!conv) return 0;
    return round(qty * conv.factor);
  };

  const totalSplit = useMemo(
    () => round(lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (conversionFor(line.uom, original?.uom)?.factor || 0), 0)),
    // conversionFor depends on conversions/original, both in deps
    [lines, conversions, original]
  );
  const available = Number(original?.availableQty) || 0;
  const remaining = Math.max(0, round(available - totalSplit));

  const clientIssues = useMemo(() => {
    const out = [];
    if (!original) out.push('Select an original barcode first.');
    if (original && !lines.length) out.push('Add at least one child barcode.');
    lines.forEach((line, index) => {
      if (!(Number(line.qty) > 0)) out.push('Row ' + (index + 1) + ': quantity must be greater than 0.');
      if (!line.uom) out.push('Row ' + (index + 1) + ': choose a UOM.');
      if (line.uom && original?.uom && !conversionFor(line.uom, original.uom)) {
        out.push('Row ' + (index + 1) + ': no approved conversion from ' + line.uom + ' to ' + original.uom + '.');
      }
      if (!(Number(line.purchaseRate) > 0)) out.push('Row ' + (index + 1) + ': enter the new purchase rate.');
      if (!(Number(line.rsp) > 0)) out.push('Row ' + (index + 1) + ': enter the new RSP.');
      priceFields.forEach(([key, label]) => {
        if (Number(line[key]) < 0) out.push('Row ' + (index + 1) + ': ' + label + ' cannot be negative.');
      });
    });
    if (original && totalSplit > available + 1e-6) {
      out.push('Total split quantity (' + totalSplit + ' ' + original.uom + ') exceeds available stock (' + available + ' ' + original.uom + ').');
    }
    return out;
  }, [original, lines, conversions, totalSplit, available]);

  async function lookup(event) {
    event?.preventDefault?.();
    const value = code.trim();
    if (!value) return;
    setLoading(true);
    setError('');
    setIssues([]);
    setImportMessage('');
    setImportIssues([]);
    try {
      const qs = new URLSearchParams({ code: value });
      if (business) qs.set('business', business);
      const res = await fetch('/api/barcode-split/original?' + qs, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Barcode not found.');
      setOriginal(data.original);
      setConversions(data.conversions || []);
      setLines([blankLine(data.original)]);
    } catch (err) {
      setOriginal(null);
      setConversions([]);
      setLines([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateLine(index, patch) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    if (!original) return;
    setLines((current) => [...current, blankLine(original)]);
  }

  function removeLine(index) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  /* ------------------------------------------------------------- Excel -- */

  function headerValue(row, ...names) {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name];
    }
    return '';
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!original) {
      setImportIssues([{ row: 0, message: 'Select the original barcode before importing rows.' }]);
      event.target.value = '';
      return;
    }

    setImportMessage('');
    setImportIssues([]);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      const rows = raw
        .map((row, index) => ({
          row: index + 2,
          originalBarcode: String(headerValue(row, 'Original Barcode', 'originalBarcode')).trim(),
          qty: headerValue(row, 'Split Quantity', 'splitQuantity', 'qty'),
          uom: String(headerValue(row, 'Split UOM', 'splitUom', 'uom')).trim(),
          barcodeNo: String(headerValue(row, 'New Barcode', 'newBarcode', 'barcodeNo')).trim(),
          purchaseRate: headerValue(row, 'Purchase Rate', 'purchaseRate'),
          discount: headerValue(row, 'Discount', 'discount'),
          finalPurchaseRate: headerValue(row, 'Final Purchase Rate', 'finalPurchaseRate'),
          rsp: headerValue(row, 'RSP', 'rsp'),
          rspOfferPrice: headerValue(row, 'RSP Offer Price', 'rspOfferPrice'),
          wsp: headerValue(row, 'WSP', 'wsp'),
          wspOfferPrice: headerValue(row, 'WSP Offer Price', 'wspOfferPrice'),
          dp: headerValue(row, 'DP', 'dp'),
          dpOfferPrice: headerValue(row, 'DP Offer Price', 'dpOfferPrice'),
          sellingPrice: headerValue(row, 'SP', 'sellingPrice'),
          hsn: String(headerValue(row, 'HSN', 'hsn')).trim(),
          gst: String(headerValue(row, 'GST', 'gst')).trim(),
          batchNo: String(headerValue(row, 'Batch', 'batchNo')).trim(),
          itemName: String(headerValue(row, 'Item Name', 'itemName')).trim(),
        }))
        .filter((row) => row.originalBarcode || row.qty || row.barcodeNo);

      if (!rows.length) throw new Error('The first sheet has no data rows.');

      const belongs = rows.filter((row) => !row.originalBarcode || row.originalBarcode === (original.barcodeNo || code.trim()));
      if (!belongs.length) {
        throw new Error('Every row is for a different original barcode. The file must be for ' + original.barcodeNo + '.');
      }

      const res = await fetch('/api/barcode-split/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, rows: belongs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The file could not be validated.');

      const groups = data.groups || [];
      if (groups.length !== 1) {
        throw new Error('The file covers more than one original barcode. Split one original at a time.');
      }
      const group = groups[0];

      if (group.errors?.length) {
        setImportIssues(group.errors.map((e) => ({
          row: e.row,
          message: e.message,
        })));
        setImportMessage('The file was not loaded - correct the rows above and import again.');
        return;
      }

      setLines(group.lines.map((line) => ({
        qty: line.qty,
        uom: line.uom,
        barcodeNo: line.providedBarcodeNo || line.barcodeNo || '',
        purchaseRate: line.purchaseRate,
        discount: line.discount,
        finalPurchaseRate: line.finalPurchaseRate,
        rsp: line.rsp,
        rspOfferPrice: line.rspOfferPrice,
        wsp: line.wsp,
        wspOfferPrice: line.wspOfferPrice,
        dp: line.dp,
        dpOfferPrice: line.dpOfferPrice,
        sellingPrice: line.sellingPrice,
        hsn: line.hsn,
        gst: line.gst,
        batchNo: line.batchNo,
      })));
      setImportMessage('Loaded ' + group.lines.length + ' row(s). Review the quantities and prices, then Save Draft or Finalize.');
    } catch (err) {
      setImportIssues([{ row: 0, message: err.message }]);
    } finally {
      event.target.value = '';
    }
  }

  async function downloadTemplate() {
    const qs = business ? '?business=' + business : '';
    const res = await fetch('/api/barcode-split/import/template' + qs);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not download the template.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Barcode_Split_Import_Template.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /* -------------------------------------------------------------- save -- */

  async function save(finalize) {
    setError('');
    setIssues([]);
    if (clientIssues.length) {
      setIssues(clientIssues);
      setError('Please correct the highlighted values.');
      return;
    }
    if (finalize && !window.confirm('Finalize this split and post the stock? The original barcode will be reduced and the child barcodes created.')) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        business,
        location,
        finYear,
        originalBarcodeId: original.barcodeId,
        originalBarcode: original.barcodeNo,
        notes,
        finalize,
        lines: lines.map((line) => ({
          qty: Number(line.qty) || 0,
          uom: line.uom,
          barcodeNo: line.barcodeNo || '',
          purchaseRate: Number(line.purchaseRate) || 0,
          discount: Number(line.discount) || 0,
          finalPurchaseRate: Number(line.finalPurchaseRate) || 0,
          rsp: Number(line.rsp) || 0,
          rspOfferPrice: Number(line.rspOfferPrice) || 0,
          wsp: Number(line.wsp) || 0,
          wspOfferPrice: Number(line.wspOfferPrice) || 0,
          dp: Number(line.dp) || 0,
          dpOfferPrice: Number(line.dpOfferPrice) || 0,
          sellingPrice: Number(line.sellingPrice) || 0,
        })),
      };

      if (draftId) {
        /* Save the edited lines against the SAME draft, then finalise it if
           that is what was asked. Finalising a different request would use
           the draft's stored lines, not what is on screen now. */
        const patch = (body) => fetch('/api/barcode-split/' + draftId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business, ...body }),
        });

        const updated = await patch({ action: 'update', notes, lines: payload.lines });
        const updateData = await updated.json().catch(() => ({}));
        if (!updated.ok) {
          const rows = Array.isArray(updateData.errors) ? updateData.errors : [];
          setIssues(rows.map((r) => ({ row: r.row, message: r.message })));
          throw new Error(updateData.error || 'The draft could not be updated.');
        }
        if (finalize) {
          const done = await patch({ action: 'finalize' });
          const doneData = await done.json().catch(() => ({}));
          if (!done.ok) throw new Error(doneData.error || 'The draft could not be finalized.');
        }
        router.push('/admin/tools/barcode-split/' + draftId);
        return;
      }

      const res = await fetch('/api/barcode-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.errors) ? data.errors : [];
        setIssues(rows.map((r) => ({ row: r.row, message: r.message })));
        throw new Error(data.error || 'The split could not be saved.');
      }
      router.push('/admin/tools/barcode-split/' + data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------- 1. original barcode --- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="barcode" size={16} /> 1. Original Barcode</span>
          <span className="card-sub">Scan, or type the barcode / item code</span>
        </div>
        <div className="card-body">
          <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className={labelCls}>Barcode / Item Code</label>
              <input
                className={inputCls}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Scan or type a barcode"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary h-[36px]" disabled={loading}>
              <Icon name="search" size={14} /> {loading ? 'Searching...' : 'Fetch Barcode'}
            </button>
            {original && (
              <button type="button" className="btn btn-ghost h-[36px]" onClick={() => { setOriginal(null); setLines([]); setCode(''); setError(''); }}>
                Clear
              </button>
            )}
          </form>

          {error && (
            <div className="mt-3 rounded-md border border-[#f3b4b0] bg-[#fdeeed] px-3 py-2 text-[13px] text-danger">
              {error}
            </div>
          )}
        </div>
      </div>

      {original && (
        <>
          {/* ----------------------------------- inherited information --- */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">2. Inherited Information</span>
              <span className="card-sub">Read-only - taken from the original barcode and its GRC</span>
            </div>
            <div className="card-body">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Original Barcode" value={original.barcodeNo} strong />
                <Info label="Item Code" value={original.itemCode} />
                <Info label="Item Name" value={original.itemName} />
                <Info label="Description" value={original.description} />
                <Info label="HSN" value={original.hsn} />
                <Info label="GST Slab" value={original.gst} />
                <Info label="UOM" value={original.uom} />
                <Info label="Available Stock" value={original.availableQty} strong />
                <Info label="Supplier" value={original.supplierName || '—'} />
                <Info label="Supplier Code" value={original.supplierCode || '—'} />
                <Info label="GRC Reference" value={original.grcNo || '—'} />
                <Info label="Purchase Reference" value={original.purchaseRef || '—'} />
                <Info label="Batch" value={original.batchNo || '—'} />
                <Info label="Barcode Classification" value={original.batchType || '—'} />
                <Info label="Purchase Rate" value={original.purchaseRate} />
                <Info label="Final Purchase Rate" value={original.finalPurchaseRate} />
                <Info label="RSP" value={original.rsp} />
                <Info label="WSP" value={original.wsp} />
                <Info label="DP" value={original.dp} />
                <Info label="Status" value={original.status} />
              </div>
              <p className="mt-3 text-[12px] text-inkmuted">
                Supplier, GRC and purchase references are inherited and cannot be changed here. The original barcode&apos;s own prices are shown for context only - each child barcode needs its own new prices below.
              </p>
            </div>
          </div>

          {/* ------------------------------------------- split quantity --- */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">3. Split Quantity &amp; UOM</span>
              <span className="card-sub">
                Available {available} {original.uom}
              </span>
            </div>
            <div className="card-body">
              <div className="overflow-x-auto">
                <table className="dt">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Split Quantity</th>
                      <th>Split UOM</th>
                      <th>Conversion</th>
                      <th>Quantity in {original.uom || 'Original UOM'}</th>
                      <th>Barcode No</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const conv = conversionFor(line.uom, original.uom);
                      return (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>
                            <input
                              className={inputCls + ' min-w-[110px]'}
                              type="number"
                              min="0"
                              step="0.001"
                              value={line.qty}
                              onChange={(e) => updateLine(index, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <select className={inputCls + ' min-w-[100px]'} value={line.uom} onChange={(e) => updateLine(index, { uom: e.target.value })}>
                              {uomOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="whitespace-nowrap text-[12px]">
                            {conv
                              ? conv.factor === 1
                                ? '1:1 (same unit)'
                                : '1 ' + line.uom + ' = ' + round(conv.factor, 6) + ' ' + original.uom
                              : <span className="text-danger">No approved conversion</span>}
                          </td>
                          <td className="font-semibold">{qtyInOriginalUom(line)} {original.uom}</td>
                          <td>
                            <input
                              className={inputCls + ' min-w-[130px]'}
                              value={line.barcodeNo}
                              onChange={(e) => updateLine(index, { barcodeNo: e.target.value })}
                              placeholder="Auto"
                            />
                          </td>
                          <td>
                            <button type="button" className="act-btn bg-danger" title="Remove row" onClick={() => removeLine(index)}>
                              <Icon name="trash" size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!lines.length && (
                      <tr><td colSpan={7} className="dt-empty">No child barcodes yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button type="button" className="btn" onClick={addLine}>
                  <Icon name="plus" size={13} /> Add Another Barcode
                </button>
                <span className="text-[13px]">
                  Original: <b>{available}</b> {original.uom} &nbsp;−&nbsp; Split: <b>{totalSplit}</b> {original.uom}
                  &nbsp;=&nbsp; Remaining: <b className={remaining < 0 ? 'text-danger' : 'text-okgreen'}>{remaining}</b> {original.uom}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ new prices --- */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">4. New Pricing for Each Child Barcode</span>
              <span className="card-sub">Mandatory - the original barcode is never repriced</span>
            </div>
            <div className="card-body overflow-x-auto">
              <table className="dt min-w-[1100px]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Qty / UOM</th>
                    {priceFields.map(([, label]) => <th key={label}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td className="whitespace-nowrap">{line.qty || 0} {line.uom}</td>
                      {priceFields.map(([key]) => (
                        <td key={key}>
                          <input
                            className={inputCls + ' min-w-[92px]'}
                            type="number"
                            min="0"
                            step="0.01"
                            value={line[key]}
                            onChange={(e) => updateLine(index, {
                              [key]: e.target.value,
                              ...(key === 'purchaseRate' || key === 'discount'
                                ? { finalPurchaseRate: round(Math.max(0, (Number(key === 'purchaseRate' ? e.target.value : line.purchaseRate) || 0) - (Number(key === 'discount' ? e.target.value : line.discount) || 0)), 2) }
                                : {}),
                            })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!lines.length && <tr><td colSpan={priceFields.length + 2} className="dt-empty">Add a child barcode first.</td></tr>}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-inkmuted">
                A child&apos;s Final Purchase Rate is pre-calculated as Purchase Rate − Discount; type over it where the business rule differs.
              </p>
            </div>
          </div>

          {/* --------------------------------------------------- import --- */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">5. Excel Import (optional)</span>
              <span className="card-sub">Validated and previewed - nothing is posted by the import</span>
            </div>
            <div className="card-body space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className={labelCls}>Split Workbook</label>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} className="text-[12px]" />
                </div>
                <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>
                  <Icon name="download" size={13} /> Download Template
                </button>
              </div>
              {importMessage && <p className="text-[13px] text-inkmuted">{importMessage}</p>}
              {importIssues.length > 0 && (
                <div className="rounded-md border border-[#f3b4b0] bg-[#fdeeed] p-3 text-[12.5px] text-danger">
                  <b>Rows that need attention</b>
                  <ul className="mt-1 list-disc pl-5">
                    {importIssues.slice(0, 25).map((issue, index) => (
                      <li key={index}>{issue.row ? 'Row ' + issue.row + ': ' : ''}{issue.message}</li>
                    ))}
                  </ul>
                  {importIssues.length > 25 && <p className="mt-1">{importIssues.length - 25} more...</p>}
                </div>
              )}
            </div>
          </div>

          {/* -------------------------------------------------- summary --- */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">6. Split Summary</span>
            </div>
            <div className="card-body">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-md border border-line bg-rowalt p-4 text-[13px]">
                  <div className="grid grid-cols-2 gap-2">
                    <span>Original Barcode</span><b>{original.barcodeNo}</b>
                    <span>Original Stock</span><b>{available} {original.uom}</b>
                    <span>Total Split Quantity</span><b>{totalSplit} {original.uom}</b>
                    <span>Remaining Quantity</span><b className={remaining < 0 ? 'text-danger' : ''}>{remaining} {original.uom}</b>
                    <span>Child Barcodes</span><b>{lines.length}</b>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea className={inputCls + ' min-h-[92px]'} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks for this split" />
                </div>
              </div>

              {issues.length > 0 && (
                <div className="mt-3 rounded-md border border-[#f3b4b0] bg-[#fdeeed] p-3 text-[12.5px] text-danger">
                  <ul className="list-disc pl-5">
                    {issues.slice(0, 20).map((issue, index) => (
                      <li key={index}>{issue.row ? 'Row ' + issue.row + ': ' : ''}{issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/tools/barcode-split')} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={() => save(false)} disabled={saving || !lines.length}>
                  <Icon name="save" size={14} /> {draftId ? 'Update Draft' : 'Save as Draft'}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving || !lines.length}>
                  <Icon name="check" size={14} /> {saving ? 'Saving...' : 'Finalize Split'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value, strong = false }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{label}</span>
      <span className={'block text-[13px] ' + (strong ? 'font-bold text-ink' : 'text-cell')}>{value === '' || value === null || value === undefined ? '—' : value}</span>
    </div>
  );
}
