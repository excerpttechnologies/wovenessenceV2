'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

/* Inter Store Sell > Delivery Challan > Edit

   Header detail only - remarks and stock point. The figures and the lines are
   shown read-only because they are already reflected in the stock ledger; the
   API refuses anything else on a challan that has been received or invoiced. */

const money = (v) => Number(v || 0).toFixed(2);
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');

export default function StoreDeliveryChallanEditPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [stockPointId, setStockPointId] = useState('');
  const [stockPoints, setStockPoints] = useState([]);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await fetch('/api/is-delivery-challan/' + id, { cache: 'no-store' });
        const d = await r.json();
        if (off) return;
        if (!r.ok || !d.doc) { setFlash({ type: 'err', msg: d.error || 'Challan not found.' }); return; }

        setDoc(d.doc);
        setRemarks(d.doc.remarks || '');
        setStockPointId(d.doc.stockPointId ? String(d.doc.stockPointId) : '');

        if (d.doc.businessId) {
          const or = await fetch(
            '/api/options?ref=stockpoint&business=' + d.doc.businessId,
            { cache: 'no-store' }
          );
          if (or.ok && !off) {
            setStockPoints(((await or.json()).options || []).map((o) => [String(o.value), o.label]));
          }
        }
      } catch {
        if (!off) setFlash({ type: 'err', msg: 'Could not reach the server.' });
      }
    })();
    return () => { off = true; };
  }, [id]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch('/api/is-delivery-challan/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { remarks, stockPointId } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Could not save.' }); return; }
      router.push('/admin/transaction/interstoresell/deliverychallan');
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <div className="card p-4">
        {flash ? <div className="flash flash-err">{flash.msg}</div> : 'Loading...'}
      </div>
    );
  }

  const locked = Boolean(doc.receivedAt || doc.salesInvoiceId);

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Edit Delivery Challan {doc.dcNo || ''}</span>
        <span className="flex-1" />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => router.push('/admin/transaction/interstoresell/deliverychallan')}
        >
          <Icon name="back" size={14} /> Back
        </button>
      </div>

      <div className="card-body space-y-4">
        {flash && <div className="flash flash-err">{flash.msg}</div>}

        {locked && (
          <div className="flash flash-err">
            {doc.salesInvoiceId
              ? 'This challan is already on a Sales Invoice - it can no longer be edited.'
              : 'The destination store has received this challan - it can no longer be edited.'}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="field-label">DC No</span>
            <input className="f-input" readOnly value={doc.dcNo || ''} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">DC Date</span>
            <input className="f-input" readOnly value={day(doc.dcDate)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Destination Store</span>
            <input className="f-input" readOnly value={doc.toLocationName || ''} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Total Qty / Value</span>
            <input
              className="f-input"
              readOnly
              value={String(Math.round((Number(doc.totalQty) || 0) * 100) / 100) + ' / ' + money(doc.netValue)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Stock Point</span>
            <select
              className="f-input"
              disabled={locked}
              value={stockPointId}
              onChange={(e) => setStockPointId(e.target.value)}
            >
              <option value="">Select...</option>
              {stockPoints.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Remarks</span>
            <input
              className="f-input"
              disabled={locked}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>
        </div>

        <div className="text-[12.5px] text-inkmuted">
          Quantity, rate, GST and the item lines cannot be changed here - the goods have already
          moved and the movement ledger records it. Delete an unreceived challan to restore the
          stock, then raise a corrected one.
        </div>

        <div className="flex items-center gap-3 border-t border-line pt-3">
          <button type="button" className="btn btn-primary" disabled={busy || locked} onClick={save}>
            {busy ? <span className="spin" /> : <Icon name="save" size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
