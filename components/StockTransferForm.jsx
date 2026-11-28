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

const todayLocalDate = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};

const toLocalDateInput = (value) => {
  if (!value) return todayLocalDate();
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return todayLocalDate();
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
};

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
  initialTransferDate = '',
} = {}) {
  const router = useRouter();
  const scope = useScope();
  const { options: locations } = useOptions('companylocations');
  const { options: destLocations } = useOptions('companylocations', { transferTarget: '1' });

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [transferDate, setTransferDate] = useState(() => toLocalDateInput(initialTransferDate));
  const [ecomReference, setEcomReference] = useState('');
  /* The most recent transfer number for this business + source location +
     financial year - read-only context for the operator, never typed. */
  const [lastTransferNo, setLastTransferNo] = useState('');

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

  /* --------------------------------------------------- resolve the source */
  const resolvedSourceId = useMemo(() => {
    if (!locations.length) return scope.location ? String(scope.location) : '';
    if (scope.location && locations.some((l) => String(l.value) === String(scope.location))) {
      return String(scope.location);
    }
    const preferred = locations.find((l) => DEFAULT_SOURCE_MATCH.test(l.label));
    return String(preferred?.value || scope.location || locations[0]?.value || '');
  }, [locations, scope.location]);

  useEffect(() => {
    setFromLocationId(resolvedSourceId);
  }, [resolvedSourceId]);

  useEffect(() => {
    if (initialTransferDate) {
      setTransferDate(toLocalDateInput(initialTransferDate));
    }
  }, [initialTransferDate]);

  /* Last Stock Transfer No: the newest document this business has already
     despatched FROM the chosen source location in this financial year.
     Re-fetched whenever the source moves - it is a read of what exists, not
     a preview of what will be generated. */
  useEffect(() => {
    if (!scope.business || !fromLocationId) { setLastTransferNo(''); return undefined; }
    let off = false;
    const qs = new URLSearchParams({
      business: scope.business,
      finYear: scope.finYear || '',
      source,
      box: 'out',
      location: fromLocationId,
      perPage: '1',
    });
    fetch('/api/stock-transfer?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        const row = (d.rows || [])[0];
        setLastTransferNo(row?.transferNo || 'No Previous Transfer');
      })
      .catch(() => { if (!off) setLastTransferNo(''); });
    return () => { off = true; };
  }, [scope.business, scope.finYear, fromLocationId, source]);

  useEffect(() => {
    if (toLocationId && fromLocationId && String(toLocationId) === String(fromLocationId)) {
      setToLocationId('');
    }
  }, [fromLocationId, toLocationId]);

  /* Destinations exclude the source: a transfer to itself is not a transfer,
     and offering it only produces a validation error later. */
  const destinations = useMemo(
    () => (destLocations.length ? destLocations : locations).filter((l) => String(l.value) !== String(fromLocationId)),
    [destLocations, locations, fromLocationId]
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
       appear without having to scroll to the end of a long list.
       `qty` starts at 1 (never more than the unit holds) and stays editable:
       for an MTR row it is the metres being sent, for a batch row the
       pieces. `availQty` is the ceiling the input validates against. */
    const avail = Number(res.unit.qty) || 0;
    setLines((rows) => [{
      ...res.unit,
      qty: Math.min(1, avail) || 1,
      availQty: avail,
    }, ...rows]);
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

  const setLineQty = (barcodeNo, value) => setLines((rows) => rows.map((l) => (
    l.barcodeNo === barcodeNo ? { ...l, qty: value } : l
  )));

  /* QTY must be a positive amount and never more than the unit holds - the
     same ceiling the server enforces, checked here so the operator sees it
     before despatch rather than as a rejected save. */
  const qtyProblem = (l) => {
    const q = Number(l.qty);
    if (!Number.isFinite(q) || q <= 0) return 'Quantity must be greater than zero.';
    if (l.availQty !== undefined && l.availQty !== null && q > Number(l.availQty) + 0.0005) {
      return 'Only ' + qtyText(l.availQty) + ' available.';
    }
    return '';
  };
  const badQtyLines = lines.filter((l) => qtyProblem(l));

  /* ----------------------------------------------------------- submit ---- */
  async function submit() {
    if (saving) return;                       // guards the double-click
    setFlash(null);

    if (!fromLocationId) return setFlash({ type: 'err', msg: 'Select a company/location in the top bar first.' });
    if (!toLocationId) return setFlash({ type: 'err', msg: 'Choose the destination location.' });
    if (!transferDate) return setFlash({ type: 'err', msg: 'Choose the transfer date.' });
    if (!lines.length) return setFlash({ type: 'err', msg: 'Scan at least one item into the transfer.' });
    if (badQtyLines.length) {
      return setFlash({
        type: 'err',
        msg: badQtyLines.length + ' line' + (badQtyLines.length > 1 ? 's have' : ' has')
          + ' an invalid quantity - enter a value greater than zero and no more than the stock available.',
      });
    }

    setSaving(true);
    try {
      const r = await fetch('/api/stock-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business,
          finYear: scope.finYear,
          fromLocationId, toLocationId,
          toStockPointId: null,
          transferDate,
          waybill: '',
          remarks: '',
          source, ecomReference,
          lines: lines.map((l) => ({ barcodeNo: l.barcodeNo, qty: Number(l.qty) })),
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

  const ready = Boolean(fromLocationId && toLocationId && transferDate && lines.length > 0);

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><Icon name="box" size={15} /> {title}</span>
        <span className="flex-1" />
        {busy && <span className="text-[12px] text-inkmuted">Checking barcode...</span>}
        {/* Close (21-10-2026): back to this screen's list without saving */}
        <button
          type="button"
          className="btn ml-2 border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]"
          title="Close"
          aria-label="Close"
          onClick={() => router.push(returnPath)}
        >
          <Icon name="x" size={16} />
        </button>
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
        <div className={'mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 ' + (referenceLabel ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          <label className="field-label">
            Destination Location<span className="f-req">*</span>
            <select
              className="f-input"
              required
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
            >
              <option value="">Select...</option>
              {destinations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="field-label">
            Transfer Date<span className="f-req">*</span>
            {/* Always today and not editable - the document is dated the day
                it is despatched, never a day the operator picks. */}
            <input
              type="date"
              required
              className="f-input bg-[#eff2f7] text-inkmuted"
              value={transferDate}
              readOnly
            />
          </label>

          <label className="field-label">
            Last Stock Transfer No
            <input
              className="f-input bg-[#eff2f7] text-inkmuted"
              value={lastTransferNo}
              readOnly
              placeholder="No Previous Transfer"
            />
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
                <th style={{ minWidth: 140 }}>Barcode / Item Code</th>
                <th style={{ minWidth: 220 }}>Description</th>
                <th style={{ width: 80 }}>UOM</th>
                <th style={{ width: 90 }} className="text-right">QTY</th>
                <th style={{ width: 100 }} className="text-right">RSP</th>
                <th style={{ minWidth: 110 }}>GRC</th>
                <th style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={8} className="dt-empty">Nothing scanned yet.</td></tr>
              )}
              {lines.map((l, i) => {
                const problem = qtyProblem(l);
                return (
                <tr key={l.barcodeNo} className={i === 0 ? 'bg-[#f0f7ff]' : ''}>
                  <td>{lines.length - i}</td>
                  <td>
                    <div className="font-mono text-[12px]">{l.barcodeNo}</div>
                    {l.itemCode && <div className="text-[11px] text-inkmuted">{l.itemCode}</div>}
                  </td>
                  <td className="max-w-[320px] truncate" title={l.itemName || l.description}>{l.itemName || l.description || '-'}</td>
                  <td>{l.uom || l.uomType}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={'f-input ml-auto h-8 w-[80px] text-right ' + (problem ? 'border-danger' : '')}
                      value={l.qty ?? ''}
                      title={problem || undefined}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => {
                        const v = e.target.value;
                        /* keep the raw text while typing - a half-typed "2."
                           is not a number yet and must not be rounded away */
                        setLineQty(l.barcodeNo, v === '' ? '' : v);
                      }}
                    />
                    {problem && <div className="pt-0.5 text-[11px] text-danger">{problem}</div>}
                  </td>
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
                );
              })}
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

        <button type="button" className="btn btn-primary btn-submit" onClick={submit} disabled={!ready || saving || badQtyLines.length > 0}>
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
