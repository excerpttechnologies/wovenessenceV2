'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { useOptions } from './useOptions';
import { useScanner, useBarcodeLookup, useScanSound } from './useScanner';

/* ==========================================================================
   Stock Transfer - build and despatch.

   The operator scans physical goods; each scan is validated against the
   server before it joins the table, so a unit that is already sold, already
   in transit, or held at a different location is refused at the moment it is
   scanned rather than at submit - when the trolley has moved on and nobody
   remembers which item it was.

   Nothing here computes stock. The table is a list of barcodes; the server
   decides what happens to them.
   ========================================================================== */

/* The source the business works out of by default. Matched by NAME against
   the locations the database returns - it is a default, not a hard-coded id,
   so an install without that branch simply falls back to the location the
   operator is signed in to. The destination is never defaulted: choosing it
   is the decision the screen exists to capture. */
const DEFAULT_SOURCE_MATCH = /temple\s*fabric/i;

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v || 0).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));

export default function StockTransferForm({
  /* The E-commerce Direct Stock Transfer is this same screen and this same
     engine, with a different origin stamped on the document and a reference
     to the order that caused it. Reusing the component rather than copying
     it is the point: an e-commerce despatch must move stock by exactly the
     same rules, or the two would drift into two inventories. */
  source = 'STOCK_TRANSFER',
  title = 'New Stock Transfer',
  referenceLabel = '',
  returnPath = '/admin/transaction/stocktransfers/transfer',
} = {}) {
  const router = useRouter();
  const scope = useScope();
  const { options: locations } = useOptions('companylocations');
  const { options: stockPoints } = useOptions('stockpoint');

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [toStockPointId, setToStockPointId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [waybill, setWaybill] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ecomReference, setEcomReference] = useState('');

  const [lines, setLines] = useState([]);
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);
  const inputRef = useRef(null);

  const beep = useScanSound();
  const { lookup, busy } = useBarcodeLookup({
    business: scope.business, location: fromLocationId, intent: 'TRANSFER',
  });

  /* --------------------------------------------------- default the source */
  useEffect(() => {
    if (fromLocationId || !locations.length) return;
    const preferred = locations.find((l) => DEFAULT_SOURCE_MATCH.test(l.label));
    setFromLocationId(preferred?.value || scope.location || locations[0]?.value || '');
  }, [locations, scope.location, fromLocationId]);

  /* Destinations exclude the source: a transfer to itself is not a transfer,
     and offering it only produces a validation error later. */
  const destinations = useMemo(
    () => locations.filter((l) => String(l.value) !== String(fromLocationId)),
    [locations, fromLocationId]
  );

  /* ---------------------------------------------------------- scanning -- */
  const scanned = useMemo(() => lines.map((l) => l.barcodeNo), [lines]);

  const addCode = useCallback(async (raw) => {
    const text = String(raw || '').trim();
    if (!text) return;

    if (!fromLocationId) {
      setFlash({ type: 'err', msg: 'Choose the source location before scanning.' });
      beep('err');
      return;
    }

    /* The already-scanned list goes to the server, so a repeat inside this
       document is reported as a duplicate rather than silently added twice. */
    const res = await lookup(text, scanned);
    if (!res.ok) {
      setFlash({ type: 'err', msg: res.error, code: res.code });
      beep('err');
      return;
    }

    /* newest at the top - the operator watches the row they just scanned
       appear without having to scroll to the end of a long list */
    setLines((rows) => [res.unit, ...rows]);
    setFlash({ type: 'ok', msg: res.unit.itemName + ' added (' + res.unit.barcodeNo + ')' });
    beep('ok');
    setCode('');
  }, [fromLocationId, lookup, scanned, beep]);

  /* Window-level scanner: works with focus anywhere on the page. */
  useScanner(addCode, { enabled: !saving });

  /* ---------------------------------------------- is this pair busy? ----- */
  useEffect(() => {
    if (!fromLocationId || !toLocationId) { setLockedBy(null); return undefined; }
    let off = false;
    const check = () => {
      const qs = new URLSearchParams({ business: scope.business || '', from: fromLocationId, to: toLocationId });
      fetch('/api/stock-transfer/lock?' + qs)
        .then((r) => r.json())
        .then((d) => { if (!off) setLockedBy(d.holder || null); })
        .catch(() => {});
    };
    check();
    /* polled rather than pushed - a lock lives seconds, and a socket for this
       one badge is not worth the infrastructure */
    const t = setInterval(check, 5000);
    return () => { off = true; clearInterval(t); };
  }, [scope.business, fromLocationId, toLocationId]);

  /* ----------------------------------------------------------- totals ---- */
  const totals = useMemo(() => {
    const pc = lines.filter((l) => l.uomType === 'PC').reduce((a, l) => a + Number(l.qty || 0), 0);
    const mtr = lines.filter((l) => l.uomType === 'MTR').reduce((a, l) => a + Number(l.qty || 0), 0);
    return {
      count: lines.length,
      qty: lines.reduce((a, l) => a + Number(l.qty || 0), 0),
      pc, mtr,
      value: lines.reduce((a, l) => a + Number(l.rate || 0) * Number(l.qty || 0), 0),
      rspValue: lines.reduce((a, l) => a + Number(l.rsp || 0) * Number(l.qty || 0), 0),
    };
  }, [lines]);

  const removeLine = (barcodeNo) => setLines((rows) => rows.filter((l) => l.barcodeNo !== barcodeNo));

  /* ----------------------------------------------------------- submit ---- */
  async function submit() {
    if (saving) return;                       // guards the double-click
    setFlash(null);

    if (!fromLocationId) return setFlash({ type: 'err', msg: 'Choose the source location.' });
    if (!toLocationId) return setFlash({ type: 'err', msg: 'Choose the destination location.' });
    if (!lines.length) return setFlash({ type: 'err', msg: 'Scan at least one item into the transfer.' });

    setSaving(true);
    try {
      const r = await fetch('/api/stock-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business,
          finYear: scope.finYear,
          fromLocationId, toLocationId,
          toStockPointId: toStockPointId || null,
          transferDate, waybill, remarks,
          source, ecomReference,
          barcodes: lines.map((l) => l.barcodeNo),
        }),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        setFlash({
          type: 'err',
          msg: d.error || Object.values(d.errors || {})[0] || 'The transfer could not be despatched.',
        });
        beep('err');
        return;
      }

      router.push(returnPath + '/' + d.id);
    } finally {
      setSaving(false);
    }
  }

  const ready = fromLocationId && toLocationId && lines.length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><Icon name="box" size={15} /> {title}</span>
        <span className="flex-1" />
        {busy && <span className="text-[12px] text-inkmuted">Checking barcode...</span>}
      </div>

      <div className="card-body">
        {flash && (
          <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>
        )}

        {lockedBy && (
          <div className="flash flash-err">
            These two locations are busy with another stock movement
            {lockedBy.refNo ? ' (' + lockedBy.refNo + ')' : ''}
            {lockedBy.userName ? ', started by ' + lockedBy.userName : ''}.
            You can keep scanning; submit once it clears.
          </div>
        )}

        {/* ------------------------------------------------- header ------ */}
        <div className="form-grid">
          <label className="field-label">
            Source Location<span className="f-req">*</span>
            <select
              className="f-input"
              value={fromLocationId}
              onChange={(e) => { setFromLocationId(e.target.value); setLines([]); }}
            >
              <option value="">Select...</option>
              {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="mt-0.5 block text-[11px] text-inkmuted">
              Changing the source clears the scanned items - they belong to the old location.
            </span>
          </label>

          <label className="field-label">
            Destination Location<span className="f-req">*</span>
            <select className="f-input" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">Select...</option>
              {destinations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="field-label">
            Destination Stock Point
            <select className="f-input" value={toStockPointId} onChange={(e) => setToStockPointId(e.target.value)}>
              <option value="">Select...</option>
              {stockPoints.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="field-label">
            Transfer Date
            <input type="date" className="f-input" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </label>

          <label className="field-label">
            Waybill / LR No
            <input className="f-input" value={waybill} onChange={(e) => setWaybill(e.target.value)} />
          </label>

          <label className="field-label">
            Remarks
            <input className="f-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>

          {referenceLabel && (
            <label className="field-label">
              {referenceLabel}
              <input
                className="f-input"
                value={ecomReference}
                onChange={(e) => setEcomReference(e.target.value)}
                placeholder="Order or reference number"
              />
            </label>
          )}
        </div>

        {/* -------------------------------------------------- scanner ---- */}
        <div className="form-section">
          <div className="form-section-title">Scan Items</div>
          <div className="kbd-hint">
            <Icon name="eye" size={13} /> A barcode scanner works anywhere on this page - the box below
            does not need focus. Press <span className="kbd">Enter</span> to add a code typed by hand.
          </div>
          <div className="mb-3 flex">
            <input
              ref={inputRef}
              data-scan-target=""
              className="f-input rounded-r-none"
              placeholder="Scan or type a barcode"
              value={code}
              disabled={!fromLocationId}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addCode(code); }
              }}
            />
            <button
              type="button"
              className="btn btn-dark rounded-l-none"
              disabled={!fromLocationId || busy}
              onClick={() => addCode(code)}
            >
              <Icon name="search" size={14} /> Add
            </button>
          </div>
        </div>

        {/* ---------------------------------------------------- table ---- */}
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Barcode</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>UOM</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">RSP</th>
                <th>GRC</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={11} className="dt-empty">Nothing scanned yet.</td></tr>
              )}
              {lines.map((l, i) => (
                <tr key={l.barcodeNo} className={i === 0 ? 'bg-[#f0f7ff]' : ''}>
                  <td>{lines.length - i}</td>
                  <td className="font-mono text-[12px]">{l.barcodeNo}</td>
                  <td>{l.itemCode || '-'}</td>
                  <td className="max-w-[280px] truncate" title={l.itemName}>{l.itemName || l.description || '-'}</td>
                  <td>{l.uom || l.uomType}</td>
                  <td>
                    <span className={'rounded px-1.5 py-0.5 text-[11px] ' +
                      (l.batchType === 'batch' ? 'bg-[#fff4d6] text-[#8a6100]' : 'bg-[#e7f3ff] text-[#0d5ddc]')}>
                      {l.batchType === 'batch' ? 'Batch' : 'Unique'}
                    </span>
                  </td>
                  <td className="text-right">{qtyText(l.qty)}</td>
                  <td className="text-right">{money(l.rate)}</td>
                  <td className="text-right">{money(l.rsp)}</td>
                  <td>{l.grcNo || '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="act-btn bg-danger"
                      title="Remove"
                      onClick={() => removeLine(l.barcodeNo)}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --------------------------------------------------- totals ---- */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Items" value={totals.count} />
          <Tile label="Total Qty" value={qtyText(totals.qty)} />
          <Tile label="Total PC" value={qtyText(totals.pc)} />
          <Tile label="Total MTR" value={qtyText(totals.mtr)} />
          <Tile label="Cost Value" value={money(totals.value)} />
          <Tile label="RSP Value" value={money(totals.rspValue)} />
        </div>

        <button type="button" className="btn btn-primary btn-submit" onClick={submit} disabled={!ready || saving}>
          {saving ? <span className="spin" /> : <Icon name="save" size={14} />}
          {saving ? ' Despatching...' : ' Despatch Transfer'}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-[#f7f9fc] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
    </div>
  );
}
