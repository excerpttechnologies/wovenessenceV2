'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { computeStoreLine, computeStoreTotals, GST_MODE, num, r2 } from '@/lib/storeSell';

/* ==========================================================================
   ONE creation form for the four Inter Store Sell documents.

   The four share a shape - a date, two stores, barcode lines, GST and totals -
   and differ only in where the lines come from:

     challan    typed/scanned barcodes, priced from the item lookup
     invoice    copied from a received Delivery Challan's saved lines
     debitnote  copied from an invoice, with the quantity to adjust
     return     copied from an invoice, with the quantity coming back

   Copying from the upstream DOCUMENT (not re-entering items) is what keeps
   the trail honest: an invoice bills exactly what the challan carried.

   Every figure shown here is a preview. The API recomputes the lines, the GST
   and the totals from the HSN > Tax master, so the saved document is the
   server's arithmetic, not the browser's.
   ========================================================================== */

const TITLES = {
  challan: 'Add Inter Store Delivery Challan',
  invoice: 'Add Inter Store Sales Invoice',
  debitnote: 'Add Received Debit Note',
  return: 'Add Inter Store Sales Return',
};

const DATE_KEY = {
  challan: 'dcDate',
  invoice: 'invoiceDate',
  debitnote: 'debitNoteDate',
  return: 'returnDate',
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => Number(v || 0).toFixed(2);
const qtyText = (v) => String(Math.round((Number(v) || 0) * 100) / 100);

export default function StoreSellDocForm({ kind }) {
  const router = useRouter();
  const scope = useScope();

  const [header, setHeader] = useState(() => ({
    [DATE_KEY[kind]]: today(),
    toLocationId: '',
    stockPointId: '',
    remarks: '',
  }));
  const [lines, setLines] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [stores, setStores] = useState([]);
  const [upstream, setUpstream] = useState([]);
  const [upstreamId, setUpstreamId] = useState('');
  const [upstreamDoc, setUpstreamDoc] = useState(null);
  const [loadingUpstream, setLoadingUpstream] = useState(false);

  /* destination stores of this business - the top bar's location is the
     SOURCE, so it is left out of the list */
  useEffect(() => {
    if (!scope.business) { setStores([]); return undefined; }
    let off = false;
    fetch('/api/options?ref=companylocations&business=' + scope.business, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        setStores((d.options || [])
          .map((o) => [String(o.value), o.label])
          .filter(([v]) => v !== String(scope.location || '')));
      })
      .catch(() => { if (!off) setStores([]); });
    return () => { off = true; };
  }, [scope.business, scope.location]);

  /* ---------------------------------------------------------- upstream -- */

  const loadUpstream = useCallback(async () => {
    if (!scope.business || !scope.location) { setUpstream([]); return; }
    setLoadingUpstream(true);
    try {
      const qs = new URLSearchParams({
        business: scope.business,
        perPage: '200',
      });

      /* The invoice is raised by the SELLING store, so its challans are the
         ones it despatched - filtered by source `location`. The two
         adjustments are raised by the BUYING store, so the invoices are the
         ones addressed TO it - filtered by `toLocationId`. Asking for the
         wrong side is what would leave both screens empty. */
      if (kind === 'invoice') qs.set('location', scope.location);
      else qs.set('toLocationId', scope.location);

      const url = kind === 'invoice'
        ? '/api/is-delivery-challan?' + qs
        : '/api/is-sales-invoice?' + qs;

      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setUpstream([]); setFlash({ type: 'err', msg: d.error || 'Could not load documents.' }); return; }

      const rows = (d.rows || []).filter((row) => {
        if (kind === 'invoice') {
          /* must have been received, and still have something unbilled */
          if (!row.receivedAt) return false;
          return (row.items || []).some((l) => r2(num(l.qty) - num(l.billedQty)) > 0);
        }
        return (row.items || []).some((l) => r2(num(l.qty) - num(l.returnedQty) - num(l.debitedQty)) > 0);
      });
      setUpstream(rows);
    } catch {
      setUpstream([]);
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setLoadingUpstream(false);
    }
  }, [kind, scope.business, scope.location]);

  useEffect(() => { loadUpstream(); }, [loadUpstream]);

  const pickUpstream = useCallback(async (id) => {
    setUpstreamId(id);
    setUpstreamDoc(null);
    setLines([]);
    if (!id) return;

    const url = (kind === 'invoice' ? '/api/is-delivery-challan/' : '/api/is-sales-invoice/') + id;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.doc) { setFlash({ type: 'err', msg: d.error || 'Could not load that document.' }); return; }
      setUpstreamDoc(d.doc);

      const rows = (d.doc.items || []).map((l) => {
        const remaining = kind === 'invoice'
          ? r2(num(l.qty) - num(l.billedQty))
          : r2(num(l.qty) - num(l.returnedQty) - num(l.debitedQty));
        return {
          ...l,
          lineId: String(l.lineId || l.challanLineId || ''),
          qty: kind === 'invoice' ? remaining : 0,
          maxQty: remaining,
        };
      }).filter((l) => l.maxQty > 0);

      setLines(rows);
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    }
  }, [kind]);

  /* ------------------------------------------------------------ barcode -- */

  async function scan() {
    const code = barcode.trim();
    if (!code || !scope.business || !scope.location) return;
    if (lines.some((l) => String(l.barcodeNo).toLowerCase() === code.toLowerCase())) {
      setFlash({ type: 'err', msg: 'That barcode is already on the challan.' });
      return;
    }
    try {
      const qs = new URLSearchParams({ business: scope.business, location: scope.location, barcode: code });
      const r = await fetch('/api/is-delivery-challan/item-lookup?' + qs, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Lookup failed.' }); return; }
      if (!d.found) { setFlash({ type: 'err', msg: 'No stock for barcode ' + code + ' at this store.' }); return; }

      setLines((cur) => [...cur, {
        lineId: '',
        barcodeNo: d.found.barcodeNo,
        itemCode: d.found.itemCode,
        itemName: d.found.itemName,
        hsn: d.found.hsn,
        uom: d.found.uom,
        qty: 1,
        maxQty: d.found.availableQty,
        unitRate: d.found.unitRate,
        discountPct: 0,
        roffDiscount: 0,
        gstPct: d.found.gstPct,
      }]);
      setBarcode('');
      setFlash(null);
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    }
  }

  const setLine = (i, key, value) => setLines((cur) => cur.map((l, n) => (
    n === i ? { ...l, [key]: value } : l
  )));

  const removeLine = (i) => setLines((cur) => cur.filter((_, n) => n !== i));

  /* ------------------------------------------------------------- totals -- */

  const mode = upstreamDoc?.gstMode || GST_MODE.CGST_SGST;

  const totals = useMemo(
    () => computeStoreTotals(lines, { mode }),
    [lines, mode]
  );

  const headLabel = kind === 'challan' ? 'Destination Store'
    : kind === 'invoice' ? 'Buying Store'
    : kind === 'debitnote' ? 'Invoice Store'
    : 'Invoice Store';

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);

    try {
      let url = '';
      let payload = null;

      if (kind === 'challan') {
        if (!header.toLocationId) { setFlash({ type: 'err', msg: 'Select the destination store.' }); setBusy(false); return; }
        if (!lines.length) { setFlash({ type: 'err', msg: 'Add at least one barcode.' }); setBusy(false); return; }
        url = '/api/is-delivery-challan';
        payload = {
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
          data: {
            toLocationId: header.toLocationId,
            dcDate: header.dcDate,
            stockPointId: header.stockPointId || undefined,
            remarks: header.remarks,
            items: lines.map((l) => ({
              barcodeNo: l.barcodeNo,
              itemCode: l.itemCode,
              itemName: l.itemName,
              hsn: l.hsn,
              uom: l.uom,
              qty: num(l.qty),
              unitRate: num(l.unitRate),
              discountPct: num(l.discountPct),
              roffDiscount: num(l.roffDiscount),
            })),
          },
        };
      } else if (kind === 'invoice') {
        if (!upstreamId) { setFlash({ type: 'err', msg: 'Select the Delivery Challan to invoice.' }); setBusy(false); return; }

        /* PARTIAL INVOICING. Each line defaults to what is still unbilled, and
           the operator may lower it. Only lines with a quantity are sent; the
           API caps every one at the challan's remaining and refuses more, so
           a reduced line here cannot become an over-bill there. */
        const picked = lines
          .filter((l) => num(l.qty) > 0)
          .map((l) => ({ challanId: upstreamId, lineId: l.lineId, qty: num(l.qty) }));

        if (!picked.length) {
          setFlash({ type: 'err', msg: 'Enter a quantity on at least one line.' });
          setBusy(false);
          return;
        }

        url = '/api/is-sales-invoice';
        payload = {
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
          data: {
            deliveryChallanIds: [upstreamId],
            invoiceDate: header.invoiceDate,
            remarks: header.remarks,
            lines: picked,
          },
        };
      } else {
        if (!upstreamId) { setFlash({ type: 'err', msg: 'Select the Sales Invoice.' }); setBusy(false); return; }
        const picked = lines
          .filter((l) => num(l.qty) > 0)
          .map((l) => ({ lineId: l.lineId, qty: num(l.qty) }));
        if (!picked.length) { setFlash({ type: 'err', msg: 'Enter a quantity on at least one line.' }); setBusy(false); return; }

        url = kind === 'debitnote' ? '/api/is-debit-note' : '/api/is-sales-return';
        payload = {
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
          data: {
            salesInvoiceId: upstreamId,
            [kind === 'debitnote' ? 'debitNoteDate' : 'returnDate']: header[DATE_KEY[kind]],
            reason: header.remarks,
            lines: picked,
          },
        };
      }

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        const firstError = d.errors ? Object.values(d.errors)[0] : d.error;
        setFlash({ type: 'err', msg: firstError || 'Could not save.' });
        return;
      }

      router.push('/admin/transaction/interstoresell/' + (
        kind === 'challan' ? 'deliverychallan'
        : kind === 'invoice' ? 'salesinvoice'
        : kind === 'debitnote' ? 'receiveddebitnote'
        : 'salesreturn'
      ));
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  const listHref = '/admin/transaction/interstoresell/' + (
    kind === 'challan' ? 'deliverychallan'
    : kind === 'invoice' ? 'salesinvoice'
    : kind === 'debitnote' ? 'receiveddebitnote'
    : 'salesreturn'
  );

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{TITLES[kind]}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={() => router.push(listHref)}>
          <Icon name="back" size={14} /> Back
        </button>
      </div>

      <div className="card-body space-y-4">
        {flash && (
          <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>
        )}

        {!scope.business && (
          <div className="flash flash-err">Select a Business in the top bar first.</div>
        )}

        {/* -------------------------------------------------- header -- */}
        <div className="grid gap-4 md:grid-cols-3">
          {kind === 'challan' ? (
            <label className="flex flex-col gap-1">
              <span className="field-label">Destination Store <span className="f-req">*</span></span>
              <select
                className="f-input"
                value={header.toLocationId}
                onChange={(e) => setHeader((h) => ({ ...h, toLocationId: e.target.value }))}
              >
                <option value="">Select...</option>
                {stores.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="field-label">{headLabel}</span>
              <input
                className="f-input"
                readOnly
                value={upstreamDoc ? (upstreamDoc.toLocationName || '') : ''}
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="field-label">
              {kind === 'challan' ? 'DC Date' : kind === 'invoice' ? 'Invoice Date' : kind === 'debitnote' ? 'Debit Note Date' : 'Return Date'}
              <span className="f-req">*</span>
            </span>
            <input
              type="date"
              className="f-input"
              value={header[DATE_KEY[kind]] || ''}
              onChange={(e) => setHeader((h) => ({ ...h, [DATE_KEY[kind]]: e.target.value }))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="field-label">{kind === 'challan' ? 'Remarks' : 'Reason / Remarks'}</span>
            <input
              className="f-input"
              value={header.remarks}
              onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
            />
          </label>
        </div>

        {/* ------------------------------------------- upstream picker -- */}
        {kind !== 'challan' && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="field-label">
                {kind === 'invoice' ? 'Delivery Challan' : 'Sales Invoice'}
                <span className="f-req">*</span>
              </span>
              <select
                className="f-input"
                value={upstreamId}
                disabled={loadingUpstream}
                onChange={(e) => pickUpstream(e.target.value)}
              >
                <option value="">{loadingUpstream ? 'Loading...' : 'Select...'}</option>
                {upstream.map((row) => (
                  <option key={row._id} value={row._id}>
                    {(row.dcNo || row.invoiceNo)}
                    {' - '}
                    {row.toLocationName || 'store'}
                    {' - '}
                    {money(row.netValue)}
                  </option>
                ))}
              </select>
            </label>

            {upstreamDoc && (
              <div className="text-[13px] text-inkmuted">
                <div><b>Date</b> : {upstreamDoc.dcDate || upstreamDoc.invoiceDate
                  ? new Date(upstreamDoc.dcDate || upstreamDoc.invoiceDate).toLocaleDateString('en-GB') : '-'}</div>
                <div><b>Financial Year</b> : {upstreamDoc.finYear || '-'}</div>
                <div><b>GST</b> : {upstreamDoc.gstMode === 'igst' ? 'IGST' : 'CGST + SGST'}</div>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- barcode -- */}
        {kind === 'challan' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[260px] flex-1 flex-col gap-1">
              <span className="field-label">Barcode</span>
              <input
                className="f-input"
                placeholder="Scan or type a barcode, then Enter"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scan(); } }}
              />
            </label>
            <button type="button" className="btn btn-dark" onClick={scan}>
              <Icon name="barcode" size={14} /> Add Item
            </button>
          </div>
        )}

        {/* ----------------------------------------------------- lines -- */}
        <div className="overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr>
                <th style={{ width: 44 }}>Sl</th>
                <th style={{ width: 120 }}>Barcode</th>
                <th>Item</th>
                <th style={{ width: 90 }}>HSN</th>
                <th style={{ width: 60 }}>UOM</th>
                <th className="!text-right" style={{ width: 90 }}>Qty</th>
                <th className="!text-right" style={{ width: 90 }}>Rate</th>
                <th className="!text-right" style={{ width: 80 }}>Disc %</th>
                <th className="!text-right" style={{ width: 90 }}>GST %</th>
                <th className="!text-right" style={{ width: 100 }}>Taxable</th>
                <th className="!text-right" style={{ width: 90 }}>IGST</th>
                <th className="!text-right" style={{ width: 90 }}>CGST</th>
                <th className="!text-right" style={{ width: 90 }}>SGST</th>
                <th className="!text-right" style={{ width: 100 }}>Net</th>
                {kind === 'challan' && <th style={{ width: 50 }}>Del</th>}
              </tr>
            </thead>
            <tbody>
              {!lines.length && (
                <tr>
                  <td colSpan={kind === 'challan' ? 15 : 14} className="dt-empty">
                    {kind === 'challan' ? 'Scan a barcode to add the first item.'
                      : 'Select a document above to load its lines.'}
                  </td>
                </tr>
              )}
              {lines.map((l, i) => {
                const c = computeStoreLine(l, { mode });
                return (
                  <tr key={l.lineId || l.barcodeNo || i}>
                    <td className="text-center">{i + 1}</td>
                    <td className="font-mono text-[12px]">{l.barcodeNo || '-'}</td>
                    <td>{l.itemName || l.itemCode || '-'}</td>
                    <td>{l.hsn || '-'}</td>
                    <td>{l.uom || '-'}</td>
                    <td className="!text-right">
                      <input
                        className="f-input !w-[80px] !text-right"
                        type="number"
                        min="0"
                        max={l.maxQty ?? undefined}
                        value={l.qty}
                        onChange={(e) => setLine(i, 'qty', e.target.value)}
                      />
                      {l.maxQty !== undefined && (
                        <div className="text-[11px] text-inkmuted">Max: {qtyText(l.maxQty)}</div>
                      )}
                    </td>
                    <td className="!text-right">
                      {kind === 'challan' ? (
                        <input
                          className="f-input !w-[85px] !text-right"
                          type="number"
                          min="0"
                          value={l.unitRate}
                          onChange={(e) => setLine(i, 'unitRate', e.target.value)}
                        />
                      ) : money(l.unitRate)}
                    </td>
                    <td className="!text-right">
                      {kind === 'challan' ? (
                        <input
                          className="f-input !w-[70px] !text-right"
                          type="number"
                          min="0"
                          value={l.discountPct}
                          onChange={(e) => setLine(i, 'discountPct', e.target.value)}
                        />
                      ) : money(l.discountPct)}
                    </td>
                    <td className="!text-right">{num(l.gstPct)}%</td>
                    <td className="!text-right">{money(c.beforeTax)}</td>
                    <td className="!text-right">{money(c.igst)}</td>
                    <td className="!text-right">{money(c.cgst)}</td>
                    <td className="!text-right">{money(c.sgst)}</td>
                    <td className="!text-right font-semibold">{money(c.netAmount)}</td>
                    {kind === 'challan' && (
                      <td>
                        <button type="button" className="act-btn act-red" title="Remove" onClick={() => removeLine(i)}>
                          <Icon name="trash" size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------------------- totals -- */}
        <div className="flex flex-wrap justify-end gap-4">
          <div className="min-w-[320px] rounded border border-line p-3 text-[13px]">
            <div className="flex justify-between gap-6"><span>Taxable Value</span><span>{money(totals.taxableValue)}</span></div>
            {mode === GST_MODE.IGST ? (
              <div className="flex justify-between gap-6"><span>IGST</span><span>{money(totals.igstTotal)}</span></div>
            ) : (
              <>
                <div className="flex justify-between gap-6"><span>CGST</span><span>{money(totals.cgstTotal)}</span></div>
                <div className="flex justify-between gap-6"><span>SGST</span><span>{money(totals.sgstTotal)}</span></div>
              </>
            )}
            <div className="flex justify-between gap-6"><span>Round Off</span><span>{money(totals.roundOff)}</span></div>
            <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1 text-[14px] font-bold">
              <span>Net Value</span><span>{money(totals.netValue)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button type="button" className="btn btn-primary" disabled={busy || !scope.business} onClick={save}>
            {busy ? <span className="spin" /> : <Icon name="save" size={14} />} Save
          </button>
          <span className="text-[13px] text-inkmuted">
            {totals.totalQty ? qtyText(totals.totalQty) + ' qty, ' + lines.length + ' line(s).' : 'No lines yet.'}
            {' '}GST is looked up from the HSN Master on save - it is not typed here.
          </span>
        </div>
      </div>
    </div>
  );
}
