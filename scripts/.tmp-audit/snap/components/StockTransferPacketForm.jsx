'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import TransferLocationPanel from './TransferLocationPanel';
import { useScope } from './ScopeContext';
import {
  GRID_COLS, INFO, BLANK_ROW, computeTotals, num, money,
} from '@/app/admin/transaction/stocktransfers/transferstockpacket/fields';

/* ==========================================================================
   Add / Edit Stock Transfer Packet.

   Stage 1 of Stock Transfers: pack goods at a source location and address
   them to a destination location + stock point inside the SAME business.

   Two things this screen does that the generic TransactionFormView can't:

     - both Location Name lists are scoped to the business in the top bar, and
       picking either one copies its GSTIN and address into the read-only
       boxes beneath it. A plain `ref` field can't drive sibling fields.
     - every line figure recalculates as you type, and the Max QTY ceiling
       comes back from the scan lookup rather than being typed.

   The maths lives in transferstockpacket/fields.js, which the API imports
   too, so what you watch while typing is what gets stored.
   ========================================================================== */

export default function StockTransferPacketForm({ cfg, id }) {
  const router = useRouter();
  const scope = useScope();
  const isEdit = Boolean(id);

  const [locations, setLocations] = useState([]);
  const [stockPoints, setStockPoints] = useState([]);

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [toStockPointId, setToStockPointId] = useState('');
  const [fromInfo, setFromInfo] = useState({ gstin: '', address: '' });
  const [toInfo, setToInfo] = useState({ gstin: '', address: '' });

  const [packetNo, setPacketNo] = useState('');
  const [stpDate, setStpDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows] = useState([]);
  const [scan, setScan] = useState('');
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  /* ------------------------------------------------- locations in scope -- */
  useEffect(() => {
    if (!scope.business) { setLocations([]); return; }
    fetch('/api/options?ref=companylocations&business=' + scope.business)
      .then((r) => r.json())
      .then((d) => setLocations(d.options || []))
      .catch(() => setLocations([]));
  }, [scope.business]);

  useEffect(() => {
    if (!scope.business) { setStockPoints([]); return; }
    fetch('/api/options?ref=stockpoint&business=' + scope.business)
      .then((r) => r.json())
      .then((d) => setStockPoints(d.options || []))
      .catch(() => setStockPoints([]));
  }, [scope.business]);

  /* the source defaults to whatever the top bar is pointing at */
  useEffect(() => {
    if (!isEdit && scope.location && !fromLocationId) setFromLocationId(scope.location);
  }, [scope.location, isEdit, fromLocationId]);

  /* GSTIN + address follow whichever location is chosen on each side */
  const loadLocationInfo = useCallback(async (locId, set) => {
    if (!locId) { set({ gstin: '', address: '' }); return; }
    try {
      const r = await fetch('/api/company-location/' + locId);
      const { doc } = await r.json();
      if (!doc) return;
      set({
        gstin: doc.gstin || '',
        address: [doc.addressLine1, doc.addressLine2, doc.city].filter(Boolean).join(', '),
      });
    } catch { /* leave the two boxes as they are */ }
  }, []);

  useEffect(() => { loadLocationInfo(fromLocationId, setFromInfo); }, [fromLocationId, loadLocationInfo]);
  useEffect(() => { loadLocationInfo(toLocationId, setToInfo); }, [toLocationId, loadLocationInfo]);

  /* ------------------------------------------------------- load on edit -- */
  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setPacketNo(d.doc.packetNo || '');
        setStpDate(d.doc.stpDate ? String(d.doc.stpDate).slice(0, 10) : '');
        setFromLocationId(String(d.doc.fromLocationId || ''));
        setToLocationId(String(d.doc.toLocationId || ''));
        setToStockPointId(String(d.doc.toStockPointId || ''));
        setRows(d.doc.items || []);
      });
  }, [id, cfg.endpoint]);

  /* ------------------------------------------------------------- rows ---- */
  const setCell = (i, k, v) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, [k]: v } : r)));
  const dropRow = (i) => setRows((prev) => prev.filter((_, ri) => ri !== i));

  /* Scan / type an item code, Enter to add. One call to the packet's own
     item-lookup, which does what the Info box promises: rejects a code with
     no GRC barcode row for this business, joins HSN -> tax slab -> UOM,
     decides IGST vs CGST+SGST from the two locations' state codes, and
     returns the stock ceiling that fills the Max QTY column. */
  const addScanned = useCallback(async (code) => {
    const term = String(code || '').trim();
    if (!term) return;

    if (!fromLocationId) {
      setFlash({ type: 'err', msg: 'Pick the source location before scanning items.' });
      return;
    }
    setFlash(null);

    const qs = new URLSearchParams({
      code: term,
      business: scope.business || '',
      fromLocation: fromLocationId,
      toLocation: toLocationId || '',
      finYear: scope.finYear || '',
    });

    try {
      const r = await fetch('/api/stock-transfer-packet/item-lookup?' + qs);
      const d = await r.json();

      /* the lookup states WHY a code was refused - surface it rather than a
         generic "not found" */
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Item lookup failed' }); return; }

      const it = d.item;
      setRows((prev) => {
        /* scanning a code already on the packet adds ONE to that line rather
           than opening a second line for the same item - which is what a
           barcode gun repeating a scan produces */
        const at = prev.findIndex((x) => {
          if (it.barcode) return String(x.barcode || '').trim().toLowerCase() === String(it.barcode).trim().toLowerCase();
          return String(x.itemCode).trim().toLowerCase() === String(it.itemCode).trim().toLowerCase();
        });
        if (at >= 0) {
          return prev.map((x, xi) => (xi === at ? { ...x, qty: num(x.qty) + 1 } : x));
        }
        return [...prev, { ...BLANK_ROW, ...it, barcode: it.barcode || '', qty: 1 }];
      });
      setScan('');
    } catch {
      setFlash({ type: 'err', msg: 'Item lookup failed' });
    }
  }, [scope.business, scope.finYear, fromLocationId, toLocationId]);

  /* ------------------------------------------------------------ totals --- */
  const totals = useMemo(() => computeTotals(rows), [rows]);

  /* ------------------------------------------------------------- save ---- */
  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const lines = rows.map((r, i) => {
        const c = totals.calc[i];
        return {
          itemId: r.itemId, itemCode: r.itemCode, barcode: r.barcode || '', itemName: r.itemName,
          hsn: r.hsn, slabName: r.slabName, uom: r.uom,
          maxQty: r.maxQty ?? null,
          qty: num(r.qty), netRate: num(r.netRate),
          igstPct: num(r.igstPct), cgstPct: num(r.cgstPct), sgstPct: num(r.sgstPct),
          beforeTax: c.beforeTax,
          igstAmount: c.igst, cgstAmount: c.cgst, sgstAmount: c.sgst,
          netAmount: c.netAmount,
        };
      });

      const payload = {
        data: {
          fromLocationId, toLocationId, toStockPointId, stpDate,
          items: lines,
          totalQty: totals.totalQty,
          taxableValue: totals.taxableValue,
          igstTotal: totals.igstTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
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

      if (r.status === 422 || r.status === 409) {
        setErrors(d.errors || {});
        setFlash({
          type: 'err',
          msg: d.error || d.errors?.items || d.errors?.toLocationId
            || 'Please correct the highlighted fields.',
        });
        return;
      }
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Save failed' }); return; }

      router.push(cfg.basePath + cfg.slugPath);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{cfg.addTitle}</span>
      </div>

      <div className="card-body">
        {flash && (
          <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>
            {flash.msg}
          </div>
        )}

        {/* --------------------------------------------- from / to / doc --- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <TransferLocationPanel
            title="Transfer From"
            locations={locations}
            value={fromLocationId}
            onPick={(v) => { setFromLocationId(v); setErrors((e) => ({ ...e, fromLocationId: undefined })); }}
            gstn={fromInfo.gstin}
            address={fromInfo.address}
            error={errors.fromLocationId}
          />

          <TransferLocationPanel
            title="Transfer To"
            locations={locations.filter((o) => o.value !== fromLocationId)}
            value={toLocationId}
            onPick={(v) => { setToLocationId(v); setErrors((e) => ({ ...e, toLocationId: undefined })); }}
            gstn={toInfo.gstin}
            address={toInfo.address}
            error={errors.toLocationId}
            stockPoint={{
              value: toStockPointId,
              onChange: setToStockPointId,
              options: stockPoints,
            }}
          />

          <div className="pt-2">
            <label className="f-label">Packet No</label>
            <input
              className="f-input bg-[#eff2f7] text-inkmuted"
              value={packetNo}
              placeholder={isEdit ? '' : 'Auto generate on save'}
              readOnly
            />

            <label className="f-label mt-3">STP Date<span className="f-req">*</span></label>
            <input
              type="date"
              className="f-input"
              value={stpDate}
              onChange={(e) => setStpDate(e.target.value)}
            />
            {errors.stpDate && <div className="f-err">{errors.stpDate}</div>}
          </div>
        </div>

        {/* ------------------------------------------------------ info --- */}
        <div className="info-box mt-5">
          <div className="mb-1.5 flex items-center gap-1.5 font-bold underline">
            <Icon name="eye" size={14} /> Info
          </div>
          <ol className="list-decimal pl-5">
            {INFO.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
          </ol>
        </div>

        {/* ------------------------------------------------------ scan --- */}
        <div className="kbd-hint">
          <Icon name="eye" size={13} /> Shortcut: Press <span className="kbd">Enter</span> /
          <span className="kbd">F9</span> / <span className="kbd">Tab</span>
          to add item &amp; and <b>box must be in focus</b>.
        </div>
        <div className="mb-3 flex max-w-[760px]">
          <input
            className="f-input rounded-r-none"
            placeholder="Scan barcode or enter item code"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (['Enter', 'F9', 'Tab'].includes(e.key)) { e.preventDefault(); addScanned(scan); }
            }}
          />
          <button
            type="button"
            className="btn btn-dark rounded-l-none"
            onClick={() => addScanned(scan)}
          >
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
                <tr>
                  <td colSpan={GRID_COLS.length} className="dt-empty">No item added</td>
                </tr>
              )}
              {rows.map((r, i) => {
                const c = totals.calc[i];
                const over = r.maxQty !== null && r.maxQty !== undefined
                  && num(r.qty) > num(r.maxQty);
                return (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td>{r.barcode || ''}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.hsn}</td>
                    <td>{r.slabName}</td>
                    <td className="text-right">
                      {r.maxQty === null || r.maxQty === undefined ? '' : r.maxQty}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className={'f-input h-8 w-[86px] ' + (over ? 'border-danger' : '')}
                        value={r.qty ?? ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => {
                          /* a negative quantity on a transfer is meaningless -
                             it would flip the line's sign all the way through
                             to the receiving location */
                          const v = e.target.value;
                          setCell(i, 'qty', v === '' ? '' : Math.max(0, Number(v)));
                        }}
                      />
                      {over && (
                        <div className="pt-0.5 text-[11px] text-danger">
                          Over available stock
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        className="f-input h-8 w-[96px]"
                        value={r.netRate ?? ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => setCell(i, 'netRate', e.target.value)}
                      />
                    </td>
                    {/* the deployed grid labels the pre-tax line value
                        "Net Amount"; the Location screen shows the same
                        figure under "Before Tax" */}
                    <td className="text-right font-bold">{money(c.beforeTax)}</td>
                    <td>
                      <button type="button" className="act-btn bg-danger" onClick={() => dropRow(i)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={6} className="text-right">Total</td>
                <td className="text-right">{money(totals.totalQty)}</td>
                <td className="text-right">{money(totals.netRateTotal)}</td>
                <td className="text-right">{money(totals.taxableValue)}</td>
                <td />
              </tr>
            </tfoot>
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
