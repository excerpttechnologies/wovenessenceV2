'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import ProductImage from './ProductImage';
import { useScope } from './ScopeContext';
import { useOptions } from './useOptions';
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

   HEADER, Inter Store Delivery Challan (matched to the Inter Company form):

     Business          the branch BOTH stores belong to. Switching it switches
                       the top bar's business, because the source store, the
                       barcode stock and the stock points all hang off it -
                       one source of truth rather than a second, contradictory
                       selector on the form.
     Location Name     the destination store - any other store of the
                       company, across its branches (lib/storeLocations.js).
                       The source store is the top bar's location and is
                       shown read-only.
     Customer GSTN     copied from the destination store's master record; the
                       API re-derives it on save, so it is never trusted from
                       the browser.
     DC Date           as before, inside the selected financial year.
     Stock Point       the dispatching store's point, scoped to that store.

   SALES INVOICE. The Buying Store and Delivery Challan pickers are driven by
   the challans that are ACTUALLY invoiceable - received, and with something
   still unbilled - so neither list can offer a document the API will refuse.
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
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');
/* the ref options arrive as plain objects; keep the extra master fields the
   challan header needs (GSTN, state) without changing the shared option shape */
const asStore = (o) => ({
  value: String(o.value),
  label: String(o.label || 'Store'),
  gstin: String(o.gstin || ''),
  state: String(o.state || ''),
});

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

  const [businesses, setBusinesses] = useState([]);
  const [stores, setStores] = useState([]);
  const [upstreamAll, setUpstreamAll] = useState([]);
  const [upstreamId, setUpstreamId] = useState('');
  const [upstreamDoc, setUpstreamDoc] = useState(null);
  const [loadingUpstream, setLoadingUpstream] = useState(false);

  /* ------------------------------------------------------------ business -- */
  useEffect(() => {
    let off = false;
    fetch('/api/options?ref=business', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!off) setBusinesses(d.options || []); })
      .catch(() => { if (!off) setBusinesses([]); });
    return () => { off = true; };
  }, []);

  /* ------------------------------------------------- destination stores -- */
  /* The destination is any OTHER store of this company - see
     lib/storeLocations.js: the branch itself, its sibling branches and the
     master rows left behind by a deleted branch. Asking for one business's
     locations here is what used to leave the picker showing a single store
     (or none) on a branch that keeps its stock in several places.
     The top bar's location is the source, so it is left out of the list. */
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState('');
  useEffect(() => {
    if (kind !== 'challan' || !scope.business) { setStores([]); return undefined; }
    let off = false;
    setStoresLoading(true);
    setStoresError('');
    fetch('/api/options?ref=companylocations&groupStores=1&business=' + scope.business, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        const list = (d.options || [])
          .map(asStore)
          .filter((o) => o.value !== String(scope.location || ''));
        setStores(list);
        /* one destination and nothing to choose - pick it, so the operator is
           not asked a question with a single answer (same as the IC form) */
        setHeader((h) => (list.some((o) => o.value === h.toLocationId)
          ? h
          : { ...h, toLocationId: list[0]?.value || '' }));
      })
      .catch(() => {
        if (off) return;
        setStores([]);
        setStoresError('Could not load the store list.');
      })
      .finally(() => { if (!off) setStoresLoading(false); });
    return () => { off = true; };
  }, [kind, scope.business, scope.location]);

  /* ---------------------------------------------------------- stock point -- */
  /* Same rule as the IC challan: stock points are locationScoped, so this is
     the dispatching store's list. Auto-pick the first, and replace a choice
     that no longer belongs to the current store. */
  const stockPointOptions = useOptions('stockpoint', '', kind === 'challan');

  useEffect(() => {
    const options = stockPointOptions.options || [];
    if (!options.length) return;
    setHeader((h) => {
      const chosen = String(h.stockPointId || '');
      if (chosen && options.some((o) => String(o.value) === chosen)) return h;
      return { ...h, stockPointId: options[0].value };
    });
  }, [stockPointOptions.options]);

  /* ---------------------------------------------------------- upstream -- */

  const loadUpstream = useCallback(async () => {
    if (kind === 'challan') return;
    if (!scope.business || !scope.location) { setUpstreamAll([]); return; }
    setLoadingUpstream(true);
    try {
      const qs = new URLSearchParams({ business: scope.business, perPage: '200' });
      if (scope.finYear) qs.set('finYear', scope.finYear);

      /* The invoice is raised by the SELLING store, so its challans are the
         ones it despatched - filtered by the SOURCE explicitly (`fromLocationId`,
         not `location`, which the list screens match against either end of the
         document). The two adjustments are raised by the BUYING store, so the
         invoices are the ones addressed TO it - filtered by `toLocationId`.
         Asking for the wrong side is what would leave both screens empty. */
      if (kind === 'invoice') qs.set('fromLocationId', scope.location);
      else qs.set('toLocationId', scope.location);

      const url = kind === 'invoice'
        ? '/api/is-delivery-challan?' + qs
        : '/api/is-sales-invoice?' + qs;

      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setUpstreamAll([]);
        setFlash({ type: 'err', msg: d.error || 'Could not load documents.' });
        return;
      }

      const rows = (d.rows || []).filter((row) => {
        if (kind === 'invoice') {
          /* must have been received, and still have something unbilled */
          if (!row.receivedAt) return false;
          return (row.items || []).some((l) => r2(num(l.qty) - num(l.billedQty)) > 0);
        }
        return (row.items || []).some((l) => r2(num(l.qty) - num(l.returnedQty) - num(l.debitedQty)) > 0);
      });
      setUpstreamAll(rows);
    } catch {
      setUpstreamAll([]);
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setLoadingUpstream(false);
    }
  }, [kind, scope.business, scope.location, scope.finYear]);

  useEffect(() => { loadUpstream(); }, [loadUpstream]);

  /* The stores that actually have something to invoice - derived from the
     eligible challans, so picking one can never produce an empty list. */
  const buyingStores = useMemo(() => {
    const seen = new Map();
    upstreamAll.forEach((row) => {
      const id = String(row.toLocationId || '');
      if (!id || seen.has(id)) return;
      seen.set(id, row.toLocationName || 'Store');
    });
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [upstreamAll]);

  useEffect(() => {
    if (kind !== 'invoice') return;
    setHeader((h) => (buyingStores.some((s) => s.value === h.toLocationId)
      ? h
      : { ...h, toLocationId: buyingStores.length === 1 ? buyingStores[0].value : '' }));
  }, [kind, buyingStores]);

  const upstream = useMemo(() => (
    kind === 'invoice' && header.toLocationId
      ? upstreamAll.filter((row) => String(row.toLocationId) === header.toLocationId)
      : upstreamAll
  ), [kind, header.toLocationId, upstreamAll]);

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
        image: d.found.image || '',
        remarks: '',
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

  /* ------------------------------------------------------- business switch -- */

  /* The WHOLE document hangs off the business, so switching it switches the
     top bar's business - the source store, its stock points and its barcodes
     then re-resolve together and no contradictory pair is possible. */
  const changeBusiness = (next) => {
    /* the placeholder is not a business - clearing the top bar would leave the
       whole form (source store, stock points, barcodes) with nothing to scope to */
    if (!next || next === scope.business) return;
    setHeader((h) => ({ ...h, toLocationId: '', stockPointId: '' }));
    setUpstreamAll([]);
    setUpstreamId('');
    setUpstreamDoc(null);
    setLines([]);
    setFlash(null);
    scope.setBusiness(next);
  };

  const changeBuyingStore = (next) => {
    setHeader((h) => ({ ...h, toLocationId: next }));
    setUpstreamId('');
    setUpstreamDoc(null);
    setLines([]);
  };

  /* ------------------------------------------------------------- totals -- */

  const sourceStore = (scope.locations || []).find((o) => String(o.value) === String(scope.location || ''));
  const destStore = stores.find((o) => o.value === header.toLocationId);

  /* Intra-state (CGST + SGST) unless the two stores record different states -
     the same rule lib/storeGst.js applies on save, so the preview matches. */
  const mode = useMemo(() => {
    if (kind !== 'challan') return upstreamDoc?.gstMode || GST_MODE.CGST_SGST;
    const a = String(sourceStore?.state || '').trim().toLowerCase();
    const b = String(destStore?.state || '').trim().toLowerCase();
    if (!a || !b) return GST_MODE.CGST_SGST;
    return a === b ? GST_MODE.CGST_SGST : GST_MODE.IGST;
  }, [kind, upstreamDoc, sourceStore, destStore]);

  const totals = useMemo(
    () => computeStoreTotals(lines, { mode }),
    [lines, mode]
  );

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);

    try {
      let url = '';
      let payload = null;

      if (kind === 'challan') {
        if (!scope.business) { setFlash({ type: 'err', msg: 'Select a Business in the top bar first.' }); setBusy(false); return; }
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
              image: l.image || '',
              remarks: l.remarks || '',
            })),
          },
        };
      } else if (kind === 'invoice') {
        if (!header.toLocationId) { setFlash({ type: 'err', msg: 'Select the Buying Store.' }); setBusy(false); return; }
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
            toLocationId: header.toLocationId,
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

  const columns = kind === 'challan' ? 17 : 16;

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
        {kind === 'challan' ? (
          <div className="form-grid-4">
            <div>
              <label className="f-label">Business<span className="f-req">*</span></label>
              <select
                className="f-input"
                value={scope.business || ''}
                onChange={(e) => changeBusiness(e.target.value)}
              >
                <option value="">--Select--</option>
                {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="f-label">Location Name<span className="f-req">*</span></label>
              <select
                className="f-input"
                value={header.toLocationId}
                disabled={!scope.business || storesLoading}
                onChange={(e) => setHeader((h) => ({ ...h, toLocationId: e.target.value }))}
              >
                <option value="">
                  {!scope.business ? 'Select a business first'
                    : storesLoading ? 'Loading stores...'
                    : stores.length ? '--Select--'
                    : 'No other store in this company'}
                </option>
                {stores.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div className="f-hint">
                {storesError || 'Every store of this company, except the source store'}
              </div>
            </div>

            <div>
              <label className="f-label">Customer GSTN</label>
              <input
                className="f-input bg-[#eff2f7] text-inkmuted"
                readOnly
                value={destStore?.gstin || ''}
                placeholder="From the store master"
              />
            </div>

            <div>
              <label className="f-label">DC Date<span className="f-req">*</span></label>
              <input
                type="date"
                className="f-input"
                value={header.dcDate || ''}
                onChange={(e) => setHeader((h) => ({ ...h, dcDate: e.target.value }))}
              />
            </div>

            <div>
              <label className="f-label">Stock Point<span className="f-req">*</span></label>
              <select
                className="f-input"
                value={header.stockPointId}
                onChange={(e) => setHeader((h) => ({ ...h, stockPointId: e.target.value }))}
              >
                <option value="">--Select--</option>
                {(stockPointOptions.options || []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="f-label">Source Store</label>
              <input
                className="f-input bg-[#eff2f7] text-inkmuted"
                readOnly
                value={sourceStore?.label || ''}
                placeholder="From the top bar"
              />
            </div>

            <div>
              <label className="f-label">Remarks</label>
              <input
                className="f-input"
                value={header.remarks}
                onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
              />
            </div>
          </div>
        ) : (
          <div className="form-grid-4">
            <div>
              <label className="f-label">
                {kind === 'invoice' ? 'Buying Store' : 'Invoice Store'}
                {kind === 'invoice' && <span className="f-req">*</span>}
              </label>
              {kind === 'invoice' ? (
                <>
                  <select
                    className="f-input"
                    value={header.toLocationId}
                    disabled={loadingUpstream}
                    onChange={(e) => changeBuyingStore(e.target.value)}
                  >
                    <option value="">{loadingUpstream ? 'Loading stores...' : '--Select--'}</option>
                    {buyingStores.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!loadingUpstream && !buyingStores.length && (
                    <div className="f-hint">No received Delivery Challan is waiting to be invoiced.</div>
                  )}
                </>
              ) : (
                <input
                  className="f-input bg-[#eff2f7] text-inkmuted"
                  readOnly
                  value={upstreamDoc ? (upstreamDoc.toLocationName || '') : (sourceStore?.label || '')}
                />
              )}
            </div>

            <div>
              <label className="f-label">
                {kind === 'invoice' ? 'Invoice Date' : kind === 'debitnote' ? 'Debit Note Date' : 'Return Date'}
                <span className="f-req">*</span>
              </label>
              <input
                type="date"
                className="f-input"
                value={header[DATE_KEY[kind]] || ''}
                onChange={(e) => setHeader((h) => ({ ...h, [DATE_KEY[kind]]: e.target.value }))}
              />
            </div>

            <div>
              <label className="f-label">Reason / Remarks</label>
              <input
                className="f-input"
                value={header.remarks}
                onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------- upstream picker -- */}
        {kind !== 'challan' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="f-label">
                {kind === 'invoice' ? 'Delivery Challan' : 'Sales Invoice'}
                <span className="f-req">*</span>
              </label>
              <select
                className="f-input"
                value={upstreamId}
                disabled={loadingUpstream || (kind === 'invoice' && !header.toLocationId)}
                onChange={(e) => pickUpstream(e.target.value)}
              >
                <option value="">
                  {loadingUpstream ? 'Loading...'
                    : upstream.length ? 'Select...'
                    : kind === 'invoice' && header.toLocationId ? 'No invoiceable challan for this store'
                    : 'No eligible documents'}
                </option>
                {upstream.map((row) => (
                  <option key={row._id} value={row._id}>
                    {(row.dcNo || row.invoiceNo)}
                    {' | '}
                    {fmtDate(row.dcDate || row.invoiceDate)}
                    {' | '}
                    {row.toLocationName || 'store'}
                    {' | '}
                    {money(row.netValue)}
                  </option>
                ))}
              </select>
            </div>

            {upstreamDoc && (
              <div className="text-[13px] text-inkmuted">
                <div><b>Date</b> : {fmtDate(upstreamDoc.dcDate || upstreamDoc.invoiceDate)}</div>
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
                <th style={{ width: 180 }}>Narration</th>
                <th style={{ width: 56 }}>Image</th>
                {kind === 'challan' && <th style={{ width: 50 }}>Del</th>}
              </tr>
            </thead>
            <tbody>
              {!lines.length && (
                <tr>
                  <td colSpan={columns} className="dt-empty">
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
                    <td>
                      {kind === 'challan' ? (
                        <input
                          className="f-input !w-[170px]"
                          type="text"
                          placeholder="Narration"
                          maxLength={200}
                          value={l.remarks || ''}
                          onChange={(e) => setLine(i, 'remarks', e.target.value)}
                        />
                      ) : (l.remarks || '-')}
                    </td>
                    <td>
                      {l.image ? <ProductImage src={l.image} alt={l.itemName || l.itemCode} size={28} /> : '-'}
                    </td>
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
