'use client';
import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';
import ProductImage from './ProductImage';
import { useScope } from './ScopeContext';
import { useScanner, useScanSound } from './useScanner';

/* ==========================================================================
   Customer return and refund.

   The flow the requirement describes, in the order it happens at a counter:

     find the sale  ->  pick or scan the items  ->  confirm  ->  refund

   Every guard is on the server (app/api/sell-pos-return/route.js) - a unit
   must have been sold on the invoice being credited, must not already have
   been credited, and the refund cannot exceed what was charged. This screen
   simply never OFFERS an action the server would refuse: a line that has
   already come back is shown greyed with the credit note it went back on,
   rather than being hidden, because "we already refunded that on CN/26/0031"
   is what the operator needs to tell the customer.
   ========================================================================== */

const REASONS = ['Damaged', 'Wrong Size', 'Wrong Item', 'Not Satisfied', 'Other'];
const REFUND_MODES = ['Cash'];

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

export default function PosReturnForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const scope = useScope();

  const business = sp.get('business') || scope.business;
  const location = sp.get('location') || scope.location;
  const finYear = sp.get('finYear') || scope.finYear;

  const [query, setQuery] = useState('');
  const [sale, setSale] = useState(null);
  const [picked, setPicked] = useState([]);
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [refundMode, setRefundMode] = useState(REFUND_MODES[0]);
  const [refundAmount, setRefundAmount] = useState('');
  const [flash, setFlash] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const beep = useScanSound();

  /* --------------------------------------------------------- find sale -- */
  const find = useCallback(async (text, byBarcode = false) => {
    const term = String(text || '').trim();
    if (!term) return;
    setLoading(true);
    setFlash(null);
    try {
      const qs = new URLSearchParams({ business: business || '', location: location || '' });
      qs.set(byBarcode ? 'barcode' : 'invoice', term);
      const r = await fetch('/api/sell-pos-return/lookup?' + qs, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setFlash({ type: 'err', msg: d.error }); beep('err'); return; }

      setSale(d);
      setPicked(byBarcode ? d.lines.filter((l) => l.barcodeNo === term && l.returnable).map((l) => l.barcodeNo) : []);
      setRefundAmount('');
      beep('ok');
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
      beep('err');
    } finally {
      setLoading(false);
    }
  }, [business, location, beep]);

  /* A scan either finds the sale (nothing loaded yet) or ticks a line on the
     sale already open - which is exactly how an operator works through a bag
     of returned goods. */
  const onScan = useCallback((codeText) => {
    if (!sale) return find(codeText, true);

    const line = sale.lines.find((l) => l.barcodeNo === codeText);
    if (!line) {
      setFlash({ type: 'err', msg: 'Barcode ' + codeText + ' is not on invoice ' + sale.invoice.invoiceNo + '.' });
      beep('err');
      return undefined;
    }
    if (!line.returnable) {
      setFlash({ type: 'err', msg: line.blockedReason });
      beep('err');
      return undefined;
    }
    setPicked((p) => (p.includes(codeText) ? p : [...p, codeText]));
    setFlash({ type: 'ok', msg: line.itemName + ' selected' });
    beep('ok');
    return undefined;
  }, [sale, find, beep]);

  useScanner(onScan, { enabled: !saving });

  /* ---------------------------------------------------------- totals ---- */
  const maxRefund = useMemo(() => {
    if (!sale) return 0;
    return round2(sale.lines
      .filter((l) => picked.includes(l.barcodeNo))
      .reduce((a, l) => a + l.refundValue, 0));
  }, [sale, picked]);

  const refund = refundAmount === '' ? maxRefund : Number(refundAmount) || 0;
  const overRefund = refund > maxRefund + 0.001;

  /* ---------------------------------------------------------- submit ---- */
  async function submit() {
    if (saving) return;
    setFlash(null);
    if (!picked.length) { setFlash({ type: 'err', msg: 'Select the items being returned.' }); return; }
    if (overRefund) { setFlash({ type: 'err', msg: 'The refund cannot exceed ' + money(maxRefund) + '.' }); return; }

    setSaving(true);
    try {
      const r = await fetch('/api/sell-pos-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business, location, finYear,
          data: {
            parentInvoiceId: sale.invoice._id,
            barcodes: picked,
            reason, notes, refundMode,
            refundAmount: refundAmount === '' ? undefined : refund,
            customerName: sale.invoice.customerSnapshot?.businessName || '',
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || Object.values(d.errors || {})[0] || 'The return could not be saved.' });
        beep('err');
        return;
      }
      setDone(d);
      beep('ok');
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------ done ---- */
  if (done) {
    return (
      <div className="card">
        <div className="card-head"><span className="card-title"><Icon name="check" size={15} /> Return completed</span></div>
        <div className="card-body">
          <div className="flash flash-ok">
            Credit note <b>{done.invoiceNo}</b> raised for {done.returnedCount} item(s).
            Refund <b>{money(done.refundAmount)}</b> by {refundMode}.
            The items are back in stock at this location.
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => router.push('/admin/transaction/sell/pos-return')}>
              View POS Returns
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => { setDone(null); setSale(null); setPicked([]); setQuery(''); setNotes(''); setRefundAmount(''); }}
            >
              Process another return
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><Icon name="undo" size={15} /> Customer Return / Refund</span>
        <span className="flex-1" />
        {loading && <span className="text-[12px] text-inkmuted">Looking up...</span>}
      </div>

      <div className="card-body">
        {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

        {/* ---------------------------------------------------- find ---- */}
        <div className="form-section">
          <div className="form-section-title">Find the original sale</div>
          <div className="kbd-hint">
            <Icon name="eye" size={13} /> Scan any item from the bill to find it automatically, or type the invoice number.
          </div>
          <div className="flex max-w-xl">
            <input
              data-scan-target=""
              className="f-input rounded-r-none"
              placeholder="Invoice number, or scan an item"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(query); } }}
            />
            <button type="button" className="btn btn-dark rounded-l-none" disabled={loading} onClick={() => find(query)}>
              <Icon name="search" size={14} /> Find
            </button>
          </div>
        </div>

        {sale && (
          <>
            {/* ------------------------------------------ the sale ---- */}
            <div className="form-section">
              <div className="form-section-title">Invoice {sale.invoice.invoiceNo}</div>
              <div className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Sold on" value={dateText(sale.invoice.date)} />
                <Info label="Bill Value" value={money(sale.invoice.totalAmount)} />
                <Info label="Contact" value={sale.invoice.customerContact || '-'} />
                <Info label="Returnable items" value={sale.summary.returnableCount + ' of ' + sale.summary.soldCount} />
              </div>

              {sale.priorReturns.length > 0 && (
                <div className="mt-2 rounded border border-line bg-[#fff4d6] p-2 text-[12px]">
                  <b>Earlier returns on this bill:</b>{' '}
                  {sale.priorReturns.map((r) => r.invoiceNo + ' (' + r.count + ' items, ' + money(r.refundAmount) + ')').join(', ')}
                </div>
              )}
            </div>

            {/* --------------------------------------------- lines ---- */}
            <div className="overflow-x-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th style={{ width: 70 }}>Image</th>
                    <th>Barcode</th>
                    <th>Item</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Refund</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((l, i) => (
                    <tr
                      key={l.barcodeNo || i}
                      className={picked.includes(l.barcodeNo) ? 'bg-[#f0f7ff]' : (!l.returnable ? 'opacity-60' : '')}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={'Return ' + (l.itemName || l.barcodeNo)}
                          disabled={!l.returnable}
                          checked={picked.includes(l.barcodeNo)}
                          onChange={() => setPicked((p) =>
                            p.includes(l.barcodeNo) ? p.filter((b) => b !== l.barcodeNo) : [...p, l.barcodeNo])}
                        />
                      </td>
                      <td><ProductImage src={l.image} alt={l.itemName} size={52} /></td>
                      <td className="font-mono text-[12px]">{l.barcodeNo || '-'}</td>
                      <td>
                        <div className="font-semibold">{l.itemName || l.itemCode}</div>
                        {l.itemCode && <div className="text-[11px] text-inkmuted">{l.itemCode}</div>}
                      </td>
                      <td className="text-right">{l.qty}</td>
                      <td className="text-right">{money(l.rate)}</td>
                      <td className="text-right">{money(l.refundValue)}</td>
                      <td className={'text-[12px] ' + (l.returnable ? 'text-[#0b7a3e]' : 'text-danger')}>
                        {l.returnable ? 'Returnable' : l.blockedReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* -------------------------------------------- refund ---- */}
            <div className="form-section mt-4">
              <div className="form-section-title">Refund</div>
              <div className="form-grid">
                <label className="field-label">
                  Reason<span className="f-req">*</span>
                  <select className="f-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>

                <label className="field-label">
                  Refund Mode
                  <select className="f-input" value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>
                    {REFUND_MODES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>

                <label className="field-label">
                  Refund Amount
                  <input
                    className="f-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={money(maxRefund)}
                    value={refundAmount}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                  <span className={'mt-0.5 block text-[11px] ' + (overRefund ? 'text-danger' : 'text-inkmuted')}>
                    {overRefund
                      ? 'More than the ' + money(maxRefund) + ' these items were billed at.'
                      : 'Leave blank to refund the full ' + money(maxRefund) + '.'}
                  </span>
                </label>

                <label className="field-label">
                  Notes
                  <input className="f-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Items selected" value={picked.length} />
                <Tile label="Max refundable" value={money(maxRefund)} />
                <Tile label="Refunding" value={money(refund)} tone={overRefund ? 'err' : 'ok'} />
                <Tile label="Mode" value={refundMode} />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-submit"
              disabled={saving || !picked.length || overRefund}
              onClick={submit}
            >
              {saving ? <span className="spin" /> : <Icon name="undo" size={14} />}
              {saving ? ' Processing...' : ' Confirm Return & Refund'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const Info = ({ label, value }) => (
  <div><span className="text-inkmuted">{label}: </span><span className="font-medium text-ink">{value}</span></div>
);

const Tile = ({ label, value, tone }) => (
  <div className={'rounded-md border border-line p-3 ' +
    (tone === 'ok' ? 'bg-[#e6f7ed]' : tone === 'err' ? 'bg-[#ffe9e9]' : 'bg-[#f7f9fc]')}>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{label}</div>
    <div className="text-lg font-bold text-ink">{value}</div>
  </div>
);
