'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { fmt } from '@/lib/format';
import {
  SOURCE_COLS, GRID_COLS, ROWS_PER_PAGE,
  linesFromChallans, invoiceTotals, money,
} from '@/app/admin/transaction/intercompanysell/salesinvoice/fields';

/* ==========================================================================
   Inter Company Sales Invoice - add / view.

   There is no line entry here. Pick a destination, tick the delivery challans
   raised for it that have not been invoiced yet, and their lines merge into
   the grid below. Invoice No, and every figure, come from the server on save.

   Ticking a challan CLAIMS it: its icSalesInvoiceId is stamped, which removes
   it from the next invoice's picker. Same claim/release pattern the Dispatch
   module uses for consignments, including the re-check at write time.
   ========================================================================== */

export default function IcSalesInvoiceForm({ cfg, id }) {
  const router = useRouter();
  const scope = useScope();
  const readOnly = Boolean(id);

  const [businesses, setBusinesses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [toBusinessId, setToBusinessId] = useState('');
  const [toLocationId, setToLocationId] = useState('');

  const [challans, setChallans] = useState([]);
  const [selected, setSelected] = useState([]);
  const [savedLines, setSavedLines] = useState(null);   // set only when viewing
  const [savedDoc, setSavedDoc] = useState(null);

  const [page, setPage] = useState(1);
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------- selectors */
  useEffect(() => {
    if (readOnly) return;
    fetch('/api/options?ref=business')
      .then((r) => r.json())
      .then((d) => setBusinesses(d.options || []))
      .catch(() => setBusinesses([]));
  }, [readOnly]);

  useEffect(() => {
    if (readOnly || !toBusinessId) { setLocations([]); return; }
    fetch('/api/options?ref=companylocations&business=' + toBusinessId)
      .then((r) => r.json())
      .then((d) => setLocations(d.options || []))
      .catch(() => setLocations([]));
  }, [toBusinessId, readOnly]);

  /* -------------------------------------------- unconverted challans --- */
  useEffect(() => {
    if (readOnly) return;
    if (!toBusinessId || !toLocationId) { setChallans([]); setSelected([]); return; }

    const qs = new URLSearchParams({
      perPage: '200',
      unconverted: 'icSalesInvoiceId',
      toBusinessId,
      toLocationId,
      business: scope.business || '',
      location: scope.location || '',
      finYear: scope.finYear || '',
    });

    fetch('/api/ic-delivery-challan?' + qs)
      .then((r) => r.json())
      .then((d) => { setChallans(d.rows || []); setSelected([]); })
      .catch(() => setChallans([]));
  }, [toBusinessId, toLocationId, scope.business, scope.location, scope.finYear, readOnly]);

  /* ------------------------------------------------------ load on view */
  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setSavedDoc(d.doc);
        setSavedLines(d.doc.items || []);
        setToBusinessId(String(d.doc.toBusinessId || ''));
        setToLocationId(String(d.doc.toLocationId || ''));
      });
  }, [id, cfg.endpoint]);

  /* --------------------------------------------------------- the lines */
  const lines = useMemo(() => {
    if (savedLines) return savedLines;
    return linesFromChallans(challans.filter((c) => selected.includes(String(c._id))));
  }, [savedLines, challans, selected]);

  const totals = useMemo(() => invoiceTotals(lines), [lines]);

  const pages = Math.max(1, Math.ceil(lines.length / ROWS_PER_PAGE));
  const shown = lines.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
  useEffect(() => { setPage(1); }, [lines.length]);

  const toggle = (dcId) =>
    setSelected((cur) => (cur.includes(dcId) ? cur.filter((x) => x !== dcId) : [...cur, dcId]));

  const allTicked = challans.length > 0 && selected.length === challans.length;
  const toggleAll = () =>
    setSelected(allTicked ? [] : challans.map((c) => String(c._id)));

  /* ------------------------------------------------------------- save */
  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            toBusinessId,
            toLocationId,
            invoiceDate: new Date().toISOString().slice(0, 10),
            icDeliveryChallanIds: selected,
          },
          business: scope.business, location: scope.location, finYear: scope.finYear,
        }),
      });
      const d = await r.json();

      if (r.status === 422 || r.status === 409) {
        setErrors(d.errors || {});
        setFlash({
          type: 'err',
          msg: d.errors?.icDeliveryChallanIds || d.error || 'Please correct the highlighted fields.',
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
          {savedDoc?.invoiceNo && (
            <>
              <span className="flex-1" />
              <span className="text-[13.5px] text-cell">
                Invoice No <b className="text-ink">{savedDoc.invoiceNo}</b>
              </span>
            </>
          )}
        </div>
        <div className="card-body">
          {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

          <div className="grid grid-cols-1 gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="f-label">Business<span className="f-req">*</span></label>
              <select
                className="f-input"
                value={toBusinessId}
                disabled={readOnly}
                onChange={(e) => { setToBusinessId(e.target.value); setToLocationId(''); }}
              >
                <option value="">--Select--</option>
                {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.toBusinessId && <div className="f-err">{errors.toBusinessId}</div>}
            </div>

            <div>
              <label className="f-label">Location<span className="f-req">*</span></label>
              <select
                className="f-input"
                value={toLocationId}
                disabled={readOnly || !toBusinessId}
                onChange={(e) => setToLocationId(e.target.value)}
              >
                <option value="">--Select--</option>
                {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.toLocationId && <div className="f-err">{errors.toLocationId}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------- the challan list --- */}
      {!readOnly && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">
              Inter Company Delivery Challan List<span className="f-req">*</span>
            </span>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allTicked}
                          disabled={challans.length === 0}
                          onChange={toggleAll}
                        />
                        Select
                      </label>
                    </th>
                    {SOURCE_COLS.map((c) => <th key={c.k}>{c.t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {challans.length === 0 && (
                    <tr>
                      <td colSpan={SOURCE_COLS.length + 1} className="dt-empty">No data found</td>
                    </tr>
                  )}
                  {challans.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(String(c._id))}
                          onChange={() => toggle(String(c._id))}
                        />
                      </td>
                      {SOURCE_COLS.map((col) => (
                        <td key={col.k}>{col.f ? fmt(col.f, c[col.k]) : (c[col.k] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* the deployed screen states the two rules in an info box */}
            <div className="info-box mt-3">
              <ol className="list-decimal pl-5">
                <li>
                  <b>Delivery Challans:</b> Lists inter company delivery challans raised for the
                  selected business and location that have not yet been converted into a sales invoice.
                </li>
                <li>
                  <b>Multiple Challan Selection:</b> You can select several challans to raise one
                  consolidated invoice.
                </li>
              </ol>
            </div>
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
                {shown.length === 0 && (
                  <tr><td colSpan={GRID_COLS.length} className="dt-empty">No Data..</td></tr>
                )}
                {shown.map((r, i) => (
                  <tr key={(r.dcId || '') + '-' + i}>
                    <td>{r.dcNo}</td>
                    <td>{r.itemCode}</td>
                    <td>{r.itemName}</td>
                    <td>{r.hsn}</td>
                    <td>{r.slabName}</td>
                    <td>{r.uom}</td>
                    <td>{r.qty}</td>
                    <td className="text-right">{money(r.unitRate)}</td>
                    <td className="text-right">{money(r.discount)}</td>
                    <td className="text-right">{money(r.roffDiscount)}</td>
                    <td className="text-right">{money(r.finalRate)}</td>
                    <td className="text-right">{money(r.beforeTax)}</td>
                    <td className="text-right">{money(r.igstAmount)}</td>
                    <td className="text-right">{money(r.cgstAmount)}</td>
                    <td className="text-right">{money(r.sgstAmount)}</td>
                    <td className="text-right font-bold">{money(r.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center pt-3 text-[13px] text-cell">
            <span>Page <b className="text-brand-link">{lines.length ? page : 0}</b> of {lines.length ? pages : 0}</span>
            <span className="flex-1" />
            <span className="flex gap-2">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ totals --- */}
      <div className="card">
        <div className="card-body">
          <table className="w-full border-collapse text-[13.5px]">
            <tbody>
              <tr className="border-b border-line">
                <td className="w-[38%] py-2 pr-3 text-right text-cell">Taxable Value</td>
                <td className="w-[22%]" /><td className="w-[18%]" />
                <td className="w-[4%] text-center text-[#c07b2a]">+</td>
                <td className="py-2 pr-3 text-right">{money(totals.taxableValue)}</td>
              </tr>
              {(totals.cgstTotal > 0 || totals.sgstTotal > 0) && (
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 text-right text-cell">CGST + SGST</td>
                  <td /><td />
                  <td className="text-center text-[#c07b2a]">+</td>
                  <td className="py-2 pr-3 text-right">{money(totals.cgstTotal + totals.sgstTotal)}</td>
                </tr>
              )}
              {totals.igstTotal > 0 && (
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 text-right text-cell">IGST</td>
                  <td /><td />
                  <td className="text-center text-[#c07b2a]">+</td>
                  <td className="py-2 pr-3 text-right">{money(totals.igstTotal)}</td>
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push(cfg.basePath + cfg.slugPath + '/print/' + id)}
              >
                <Icon name="printer" size={14} /> Print E-Invoice
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
