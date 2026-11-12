'use client';

import { use, useCallback, useEffect } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BarcodeLabelSheet from '@/components/BarcodeLabelSheet';
import useBarcodeLabelFormat from '@/components/useBarcodeLabelFormat';
import { withLabelCounts } from '@/lib/barcodeLabelPrint';
import { useScope } from '@/components/ScopeContext';

/* Tools > Barcode Split > detail.

   Shows the split, every child barcode with its new prices, the genealogy
   chain back to the root and the split history of the original. From here a
   draft can be finalised, a finalized split printed or exported, and either
   cancelled with the stock reversed. Labels always read the STORED child
   number - reprinting never issues a new one. */

const STATUS_TONE = { Draft: 'pill-yellow', Finalized: 'pill-green', Cancelled: 'pill-red' };

const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function BarcodeSplitDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { business } = useScope();
  const { format } = useBarcodeLabelFormat();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = business ? '?business=' + business : '';
      const res = await fetch('/api/barcode-split/' + id + qs, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not load this split.');
      setData(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, business]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data || loading) return;
    if (new URLSearchParams(window.location.search).get('print') === '1') {
      setTimeout(() => window.print(), 500);
    }
  }, [data, loading]);

  async function act(action) {
    if (action === 'cancel') {
      const reason = window.prompt('Reason for cancelling this split? Finalized splits reverse their stock.');
      if (reason === null) return;
      setBusy(true);
      try {
        const res = await fetch('/api/barcode-split/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', business, reason }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The split could not be cancelled.');
        load();
      } catch (err) {
        window.alert(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'finalize') {
      if (!window.confirm('Finalize this split? The original barcode will be reduced and the child barcodes created in stock.')) return;
      setBusy(true);
      try {
        const res = await fetch('/api/barcode-split/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finalize', business }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The split could not be finalized.');
        load();
      } catch (err) {
        window.alert(err.message);
      } finally {
        setBusy(false);
      }
    }
  }

  if (loading) {
    return <div className="card"><div className="card-body"><span className="spin" /></div></div>;
  }
  if (error) {
    return <div className="rounded-md border border-[#f3b4b0] bg-[#fdeeed] p-4 text-[13px] text-danger">{error}</div>;
  }
  if (!data?.split) return null;

  const { split, children, genealogy, history } = data;
  const childLines = split.lines || [];

  /* Printed from the stored child numbers and the label rules every other
     barcode screen uses: the chosen Barcode Label Setting supplies the
     sticker geometry, and the barcode value is the one already on the child
     row - printing never issues a new number. A draft has no child rows in
     stock yet, so there is nothing on the sheet. */
  const labelRows = split.status === 'Finalized'
    ? withLabelCounts(childLines.map((line) => ({
      barcodeNo: line.childBarcodeNo,
      barcodeGenerated: '',
      itemCode: split.itemCode,
      printDescription: split.itemName,
      qty: line.qty,
      qtyNum: line.qty,
      uom: line.uom,
      batchType: 'unique',
      batchUnique: 'unique',
      retailPrice: line.rsp,
      offerPrice: line.rspOfferPrice,
      purRate: line.purchaseRate,
      finalNet: line.finalPurchaseRate,
    })))
    : [];

  return (
    <>
      <style>{`
        @media screen { .print-area { display: none; } }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; display: block; }
          .no-print { display: none !important; }
          .barcode-label { page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/tools/barcode-split')}>
            <Icon name="back" size={14} /> Back
          </button>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight">{split.splitNo}</h1>
            <p className="text-[12.5px] text-inkmuted">
              {split.originalBarcodeNo} · {split.itemCode} {split.itemName ? '· ' + split.itemName : ''}
            </p>
          </div>
          <span className={'pill ' + (STATUS_TONE[split.status] || 'pill-grey')}>{split.status}</span>
          <div className="flex-1" />
          {split.status === 'Draft' && (
            <>
              <button type="button" className="btn" onClick={() => router.push('/admin/tools/barcode-split/' + split._id + '/edit')}>
                <Icon name="pencil" size={14} /> Edit Draft
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('finalize')}>
                <Icon name="check" size={14} /> Finalize
              </button>
            </>
          )}
          {split.status === 'Finalized' && (
            <>
              <button type="button" className="btn" onClick={() => window.print()}>
                <Icon name="printer" size={14} /> Print All Child Barcodes
              </button>
              <a className="btn" href={'/api/barcode-split/' + split._id + '/export?business=' + (business || '')}>
                <Icon name="download" size={14} /> Export Excel
              </a>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act('cancel')}>
                <Icon name="undo" size={14} /> Cancel / Reverse
              </button>
            </>
          )}
          {split.status === 'Cancelled' && <span className="pill pill-red">Stock reversed</span>}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card">
            <div className="card-head"><span className="card-title">Original Barcode &amp; Inheritance</span></div>
            <div className="card-body grid grid-cols-2 gap-2 text-[13px]">
              <span className="text-inkmuted">Original Barcode</span><b>{split.originalBarcodeNo}</b>
              <span className="text-inkmuted">Item Code</span><b>{split.itemCode}</b>
              <span className="text-inkmuted">Item Name</span><b>{split.itemName || '—'}</b>
              <span className="text-inkmuted">Supplier</span><b>{split.supplierName || '—'}</b>
              <span className="text-inkmuted">Supplier Code</span><b>{split.supplierCode || '—'}</b>
              <span className="text-inkmuted">GRC Reference</span><b>{split.grcNo || '—'}</b>
              <span className="text-inkmuted">Purchase Reference</span><b>{split.purchaseRef || '—'}</b>
              <span className="text-inkmuted">HSN</span><b>{split.snapshot?.hsn || '—'}</b>
              <span className="text-inkmuted">GST</span><b>{split.snapshot?.gst || '—'}</b>
              <span className="text-inkmuted">Batch</span><b>{split.snapshot?.batchNo || '—'}</b>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">Split Summary</span></div>
            <div className="card-body grid grid-cols-2 gap-2 text-[13px]">
              <span className="text-inkmuted">Original Quantity</span><b>{split.originalQty} {split.originalUom}</b>
              <span className="text-inkmuted">Total Split Quantity</span><b>{split.totalSplitQty} {split.originalUom}</b>
              <span className="text-inkmuted">Remaining Quantity</span><b>{split.remainingQty} {split.originalUom}</b>
              <span className="text-inkmuted">New Barcodes</span><b>{split.childCount}</b>
              <span className="text-inkmuted">Created By</span><b>{split.createdByName || '—'}</b>
              <span className="text-inkmuted">Created</span><b>{fmtDate(split.createdAt)}</b>
              <span className="text-inkmuted">Finalized</span><b>{fmtDate(split.finalizedAt)}</b>
              <span className="text-inkmuted">Cancelled</span><b>{fmtDate(split.cancelledAt)}</b>
              {split.notes && <><span className="text-inkmuted">Notes</span><b>{split.notes}</b></>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Child Barcodes</span>
            <span className="card-sub">{childLines.length} row(s)</span>
          </div>
          <div className="card-body overflow-x-auto">
            <table className="dt min-w-[1150px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>New Barcode</th>
                  <th>Quantity</th>
                  <th>UOM</th>
                  <th>Conversion</th>
                  <th>In {split.originalUom}</th>
                  <th>Purchase Rate</th>
                  <th>Final Purchase Rate</th>
                  <th>RSP</th>
                  <th>WSP</th>
                  <th>DP</th>
                  <th>SP</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {childLines.map((line, index) => {
                  const child = (children || []).find((c) => c.barcodeNo === line.childBarcodeNo);
                  return (
                    <tr key={line._id || index}>
                      <td>{index + 1}</td>
                      <td className="font-semibold">{line.childBarcodeNo}</td>
                      <td>{line.qty}</td>
                      <td>{line.uom}</td>
                      <td>{Number(line.conversionFactor) === 1 ? '1:1' : '×' + line.conversionFactor}</td>
                      <td>{line.qtyInOriginalUom} {split.originalUom}</td>
                      <td>{line.purchaseRate}</td>
                      <td>{line.finalPurchaseRate}</td>
                      <td>{line.rsp}</td>
                      <td>{line.wsp}</td>
                      <td>{line.dp}</td>
                      <td>{line.sellingPrice}</td>
                      <td>{child?.status || (split.status === 'Finalized' ? 'IN_STOCK' : 'Pending')}</td>
                    </tr>
                  );
                })}
                {!childLines.length && <tr><td colSpan={13} className="dt-empty">No child barcodes.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card">
            <div className="card-head"><span className="card-title">Barcode Genealogy</span></div>
            <div className="card-body text-[13px]">
              {genealogy?.ancestry?.length ? (
                <div className="mb-3">
                  <span className="block text-[11px] font-semibold uppercase text-inkmuted">Parent chain</span>
                  {genealogy.ancestry.map((a) => (
                    <div key={a._id} className="flex items-center gap-2 py-1">
                      <Icon name="chevR" size={12} />
                      <span className="font-semibold">{a.barcodeNo}</span>
                      <span className="text-inkmuted">{a.itemCode} · {a.qtyNum} {a.uom} · {a.status}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-inkmuted">This original barcode is the root of its chain.</p>}

              <div className="mb-1 text-[11px] font-semibold uppercase text-inkmuted">Immediate children</div>
              {(genealogy?.children || []).length ? genealogy.children.map((c) => (
                <div key={c._id} className="flex items-center gap-2 py-1">
                  <Icon name="chevR" size={12} />
                  <span className="font-semibold">{c.barcodeNo}</span>
                  <span className="text-inkmuted">{c.qtyNum} {c.uom} · {c.status}</span>
                </div>
              )) : <p className="text-inkmuted">No child barcodes.</p>}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">Split History for this Original</span></div>
            <div className="card-body overflow-x-auto">
              <table className="dt">
                <thead><tr><th>Split No</th><th>Qty</th><th>Children</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {(history || []).map((h) => (
                    <tr key={h._id}>
                      <td>{h._id === split._id ? <b>{h.splitNo}</b> : (
                        <button type="button" className="text-brand-link underline" onClick={() => router.push('/admin/tools/barcode-split/' + h._id)}>{h.splitNo}</button>
                      )}</td>
                      <td>{h.totalSplitQty}</td>
                      <td>{h.childCount}</td>
                      <td><span className={'pill ' + (STATUS_TONE[h.status] || 'pill-grey')}>{h.status}</span></td>
                      <td>{fmtDate(h.createdAt)}</td>
                    </tr>
                  ))}
                  {!(history || []).length && <tr><td colSpan={5} className="dt-empty">No history.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- print labels --- */}
      <div className="print-area">
        <BarcodeLabelSheet rows={labelRows} format={format} />
      </div>
    </>
  );
}
