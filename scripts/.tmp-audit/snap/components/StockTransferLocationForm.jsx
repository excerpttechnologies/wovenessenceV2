'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import TransferLocationPanel from './TransferLocationPanel';
import { useScope } from './ScopeContext';
import { fmt } from '@/lib/format';
import {
  INFO, SOURCE_COLS, GRID_COLS,
  linesFromPackets, locationTotals, money,
} from '@/app/admin/transaction/stocktransfers/transferstocklocation/fields';

/* ==========================================================================
   Add / View Stock Transfer Location.

   Stage 2: consolidate one or more unconverted Stock Transfer Packets that
   share the same From -> To pair into a single despatch, and attach the
   waybill.

   There is no line entry here. Pick the two locations, tick the packets, and
   their lines merge into the grid below. Packet No and every figure come from
   the server on save.

   Ticking a packet CLAIMS it: its stockTransferLocationId is stamped, which
   removes it from the next transfer's picker. Same claim/release pattern the
   Inter Company Sales Invoice uses for delivery challans, including the
   re-check at write time.
   ========================================================================== */

export default function StockTransferLocationForm({ cfg, id }) {
  const router = useRouter();
  const scope = useScope();
  const readOnly = Boolean(id);

  const [locations, setLocations] = useState([]);
  const [stockPoints, setStockPoints] = useState([]);

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [toStockPointId, setToStockPointId] = useState('');
  const [fromInfo, setFromInfo] = useState({ gstin: '', address: '' });
  const [toInfo, setToInfo] = useState({ gstin: '', address: '' });

  const [packetNo, setPacketNo] = useState('');
  const [stlDate, setStlDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [waybill, setWaybill] = useState('');

  const [packets, setPackets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [savedLines, setSavedLines] = useState(null);   // set only when viewing

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

  useEffect(() => {
    if (!readOnly && scope.location && !fromLocationId) setFromLocationId(scope.location);
  }, [scope.location, readOnly, fromLocationId]);

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

  /* -------------------------------------------- unconverted packets ----- */
  useEffect(() => {
    if (readOnly) return;
    if (!fromLocationId || !toLocationId) { setPackets([]); setSelected([]); return; }

    const qs = new URLSearchParams({
      perPage: '200',
      unconverted: 'stockTransferLocationId',
      fromLocationId,
      toLocationId,
      business: scope.business || '',
      finYear: scope.finYear || '',
    });

    fetch('/api/stock-transfer-packet?' + qs)
      .then((r) => r.json())
      .then((d) => { setPackets(d.rows || []); setSelected([]); })
      .catch(() => setPackets([]));
  }, [fromLocationId, toLocationId, scope.business, scope.finYear, readOnly]);

  /* ------------------------------------------------------ load on view -- */
  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setPacketNo(d.doc.packetNo || '');
        setStlDate(d.doc.stlDate ? String(d.doc.stlDate).slice(0, 10) : '');
        setWaybill(d.doc.stockTransferWaybill || '');
        setFromLocationId(String(d.doc.fromLocationId || ''));
        setToLocationId(String(d.doc.toLocationId || ''));
        setToStockPointId(String(d.doc.toStockPointId || ''));
        setSavedLines(d.doc.items || []);
      });
  }, [id, cfg.endpoint]);

  /* --------------------------------------------------------- the lines -- */
  const lines = useMemo(() => {
    if (savedLines) return savedLines;
    return linesFromPackets(packets.filter((p) => selected.includes(String(p._id))));
  }, [savedLines, packets, selected]);

  const totals = useMemo(() => locationTotals(lines), [lines]);

  const toggle = (pid) =>
    setSelected((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));

  const allTicked = packets.length > 0 && selected.length === packets.length;
  const toggleAll = () => setSelected(allTicked ? [] : packets.map((p) => String(p._id)));

  /* ------------------------------------------------------------- save --- */
  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            fromLocationId,
            toLocationId,
            toStockPointId,
            stlDate,
            stockTransferWaybill: waybill,
            packetIds: selected,
          },
          business: scope.business, location: scope.location, finYear: scope.finYear,
        }),
      });
      const d = await r.json();

      if (r.status === 422 || r.status === 409) {
        setErrors(d.errors || {});
        setFlash({
          type: 'err',
          msg: d.errors?.packetIds || d.errors?.toLocationId || d.error
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
    <>
      {/* ----------------------------------------------------- header --- */}
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

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <TransferLocationPanel
              title="Transfer From"
              locations={locations}
              value={fromLocationId}
              onPick={(v) => { setFromLocationId(v); setErrors((e) => ({ ...e, fromLocationId: undefined })); }}
              gstn={fromInfo.gstin}
              address={fromInfo.address}
              disabled={readOnly}
              error={errors.fromLocationId}
              required={false}
            />

            <TransferLocationPanel
              title="Transfer To"
              locations={locations.filter((o) => o.value !== fromLocationId)}
              value={toLocationId}
              onPick={(v) => { setToLocationId(v); setErrors((e) => ({ ...e, toLocationId: undefined })); }}
              gstn={toInfo.gstin}
              address={toInfo.address}
              disabled={readOnly}
              error={errors.toLocationId}
              stockPoint={{
                value: toStockPointId,
                onChange: setToStockPointId,
                options: stockPoints,
                disabled: readOnly,
              }}
            />

            <div className="pt-2">
              <label className="f-label">Packet No</label>
              <input
                className="f-input bg-[#eff2f7] text-inkmuted"
                value={packetNo}
                placeholder={readOnly ? '' : 'Auto generate on save'}
                readOnly
              />

              <label className="f-label mt-3">STL Date<span className="f-req">*</span></label>
              <input
                type="date"
                className="f-input"
                value={stlDate}
                disabled={readOnly}
                onChange={(e) => setStlDate(e.target.value)}
              />
              {errors.stlDate && <div className="f-err">{errors.stlDate}</div>}

              <label className="f-label mt-3">
                Stock Transfer Waybill
                <span className="ml-1 text-brand-link">&#9432;</span>
              </label>
              {readOnly ? (
                <input className="f-input bg-[#eff2f7] text-inkmuted" value={waybill} readOnly />
              ) : (
                <div className="flex h-9 items-center gap-2 rounded-md border border-linestrong bg-white px-1 text-[13px]">
                  <span className="rounded bg-[#eff2f7] px-2 py-1">Choose Files</span>
                  <span className="text-inkmuted">{waybill || 'No file chosen'}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setWaybill(e.target.files?.[0]?.name || '')}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------- the packet list --- */}
      {!readOnly && (
        <div className="card">
          <div className="card-body">
            <div className="info-box">
              <div className="mb-1.5 flex items-center gap-1.5 font-bold underline">
                <Icon name="eye" size={14} /> Info
              </div>
              <ol className="list-decimal pl-5">
                {INFO.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
              </ol>
            </div>

            <div className="mt-3 text-[14px] font-semibold">
              Stock Transfer Packet List<span className="f-req">*</span>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th style={{ width: 90 }}>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allTicked}
                          disabled={packets.length === 0}
                          onChange={toggleAll}
                        />
                        Select
                      </label>
                    </th>
                    {SOURCE_COLS.map((c) => <th key={c.k}>{c.t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {packets.length === 0 && (
                    <tr>
                      <td colSpan={SOURCE_COLS.length + 2} className="dt-empty">
                        No Stock Transfer Packet Found...
                      </td>
                    </tr>
                  )}
                  {packets.map((p, i) => (
                    <tr key={p._id}>
                      <td>{i + 1}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(String(p._id))}
                          onChange={() => toggle(String(p._id))}
                        />
                      </td>
                      {SOURCE_COLS.map((col) => (
                        <td key={col.k}>{col.f ? fmt(col.f, p[col.k]) : (p[col.k] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.packetIds && <div className="f-err mt-1">{errors.packetIds}</div>}
          </div>
        </div>
      )}

      {/* --------------------------------------------------- line grid --- */}
      <div className="card">
        <div className="card-body">
          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>{GRID_COLS.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={GRID_COLS.length} className="dt-empty">No data found</td></tr>
                )}
                {lines.map((r, i) => (
                  <tr key={(r.packetId || '') + '-' + i}>
                    <td className="text-center">{i + 1}</td>
                    <td>{r.packetNo}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.hsn}</td>
                    <td>{r.slabName}</td>
                    <td className="text-right">{r.qty}</td>
                    <td className="text-right">{money(r.netRate)}</td>
                    <td className="text-right">{money(r.beforeTax)}</td>
                    <td className="text-right">{money(r.igstAmount)}</td>
                    <td className="text-right">{money(r.cgstAmount)}</td>
                    <td className="text-right">{money(r.sgstAmount)}</td>
                    <td className="text-right font-bold">{money(r.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={6} className="text-right">Total</td>
                  <td className="text-right">{money(totals.totalQty)}</td>
                  <td className="text-right">{money(totals.netRateTotal)}</td>
                  <td className="text-right">{money(totals.taxableValue)}</td>
                  <td className="text-right">{money(totals.igstTotal)}</td>
                  <td className="text-right">{money(totals.cgstTotal)}</td>
                  <td className="text-right">{money(totals.sgstTotal)}</td>
                  <td className="text-right">{money(totals.netValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary mx-auto mt-4 flex h-[38px] w-full max-w-[430px] justify-center"
              onClick={submit}
              disabled={saving || selected.length === 0}
            >
              {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Submit
            </button>
          )}

          {readOnly && (
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                <Icon name="printer" size={14} /> Print
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => router.push(cfg.basePath + cfg.slugPath)}
              >
                <Icon name="back" size={14} /> Back
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
