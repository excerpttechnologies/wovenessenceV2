'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BarcodeLabelSheet from '@/components/BarcodeLabelSheet';
import useBarcodeLabelFormat from '@/components/useBarcodeLabelFormat';
import { withLabelCounts } from '@/lib/barcodeLabelPrint';
import { useScope } from '@/components/ScopeContext';

/* Tools > Barcode Merge > detail.

   The merged barcode, every source it consumed with that source's own prices,
   and the approved merged prices. Drafts can be finalised; finalized merges
   can be printed, exported or cancelled (which restores the sources). */

const STATUS_TONE = { Draft: 'pill-yellow', Finalized: 'pill-green', Cancelled: 'pill-red' };
const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function BarcodeMergeDetailPage({ params }) {
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
      const res = await fetch('/api/barcode-merge/' + id + qs, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not load this merge.');
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
      const reason = window.prompt('Reason for cancelling this merge? Finalized merges restore their source stock.');
      if (reason === null) return;
      setBusy(true);
      try {
        const res = await fetch('/api/barcode-merge/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', business, reason }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The merge could not be cancelled.');
        load();
      } catch (err) {
        window.alert(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'finalize') {
      if (!window.confirm('Finalize this merge? Source barcodes will be consumed and the merged barcode created in stock.')) return;
      setBusy(true);
      try {
        const res = await fetch('/api/barcode-merge/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finalize', business }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The merge could not be finalized.');
        load();
      } catch (err) {
        window.alert(err.message);
      } finally {
        setBusy(false);
      }
    }
  }

  if (loading) return <div className="card"><div className="card-body"><span className="spin" /></div></div>;
  if (error) return <div className="rounded-md border border-[#f3b4b0] bg-[#fdeeed] p-4 text-[13px] text-danger">{error}</div>;
  if (!data?.merge) return null;

  const { merge, merged, sourceRows } = data;

  /* The merged unit is printed on the same sticker stock and through the
     same label contract as every other barcode. Quantity is the merged
     total, so a length merge still reads as a length on the sticker. */
  const labelRows = merge.status === 'Finalized'
    ? withLabelCounts([{
      barcodeNo: merge.mergedBarcodeNo,
      barcodeGenerated: '',
      itemCode: merge.itemCode,
      printDescription: merge.itemName,
      qty: merge.totalQty,
      qtyNum: merge.totalQty,
      uom: merge.uom,
      batchType: 'unique',
      batchUnique: 'unique',
      retailPrice: merge.rsp,
      offerPrice: merge.rspOfferPrice,
      purRate: merge.purchaseRate,
      finalNet: merge.finalPurchaseRate,
    }])
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
        }
      `}</style>

      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/tools/barcode-merge')}><Icon name="back" size={14} /> Back</button>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight">{merge.mergeNo}</h1>
            <p className="text-[12.5px] text-inkmuted">{merge.mergedBarcodeNo} · {merge.itemCode} {merge.itemName ? '· ' + merge.itemName : ''}</p>
          </div>
          <span className={'pill ' + (STATUS_TONE[merge.status] || 'pill-grey')}>{merge.status}</span>
          <div className="flex-1" />
          {merge.status === 'Draft' && (
            <>
              <button type="button" className="btn" onClick={() => router.push('/admin/tools/barcode-merge/' + merge._id + '/edit')}><Icon name="pencil" size={14} /> Edit Draft</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act('finalize')}><Icon name="check" size={14} /> Finalize</button>
            </>
          )}
          {merge.status === 'Finalized' && (
            <>
              <button type="button" className="btn" onClick={() => window.print()}><Icon name="printer" size={14} /> Print Merged Barcode</button>
              <a className="btn" href={'/api/barcode-merge/' + merge._id + '/export?business=' + (business || '')}><Icon name="download" size={14} /> Export Excel</a>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => act('cancel')}><Icon name="undo" size={14} /> Cancel / Reverse</button>
            </>
          )}
          {merge.status === 'Cancelled' && <span className="pill pill-red">Stock restored</span>}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card">
            <div className="card-head"><span className="card-title">Merged Barcode</span></div>
            <div className="card-body grid grid-cols-2 gap-2 text-[13px]">
              <span className="text-inkmuted">Merged Barcode</span><b>{merge.mergedBarcodeNo}</b>
              <span className="text-inkmuted">Item Code</span><b>{merge.itemCode}</b>
              <span className="text-inkmuted">Item Name</span><b>{merge.itemName || '—'}</b>
              <span className="text-inkmuted">Supplier</span><b>{merge.supplierName || '—'}</b>
              <span className="text-inkmuted">Supplier Code</span><b>{merge.supplierCode || '—'}</b>
              <span className="text-inkmuted">Source Barcodes</span><b>{merge.sourceCount}</b>
              <span className="text-inkmuted">Total Quantity</span><b>{merge.totalQty} {merge.uom}</b>
              <span className="text-inkmuted">Merged Stock Status</span><b>{merged?.status || '—'}</b>
              <span className="text-inkmuted">GRC References</span><b>{(merge.snapshot?.grcNos || []).join(', ') || '—'}</b>
              <span className="text-inkmuted">Batch</span><b>{merge.snapshot?.batchNo || '—'}</b>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-title">Approved Merged Prices</span></div>
            <div className="card-body grid grid-cols-2 gap-2 text-[13px]">
              <span className="text-inkmuted">Purchase Rate</span><b>{merge.purchaseRate}</b>
              <span className="text-inkmuted">Discount</span><b>{merge.discount}</b>
              <span className="text-inkmuted">Final Purchase Rate</span><b>{merge.finalPurchaseRate}</b>
              <span className="text-inkmuted">RSP</span><b>{merge.rsp}</b>
              <span className="text-inkmuted">RSP Offer Price</span><b>{merge.rspOfferPrice}</b>
              <span className="text-inkmuted">WSP</span><b>{merge.wsp}</b>
              <span className="text-inkmuted">WSP Offer Price</span><b>{merge.wspOfferPrice}</b>
              <span className="text-inkmuted">DP</span><b>{merge.dp}</b>
              <span className="text-inkmuted">DP Offer Price</span><b>{merge.dpOfferPrice}</b>
              <span className="text-inkmuted">SP</span><b>{merge.sellingPrice}</b>
              <span className="text-inkmuted">Created By</span><b>{merge.createdByName || '—'}</b>
              <span className="text-inkmuted">Created</span><b>{fmtDate(merge.createdAt)}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Source Barcodes</span><span className="card-sub">Source history preserved - nothing deleted</span></div>
          <div className="card-body overflow-x-auto">
            <table className="dt min-w-[1100px]">
              <thead>
                <tr>
                  <th>#</th><th>Source Barcode</th><th>Quantity</th><th>UOM</th>
                  <th>Conversion</th><th>In Merged UOM</th><th>Purchase Rate</th>
                  <th>RSP</th><th>WSP</th><th>DP</th><th>SP</th>
                  <th>GRC No</th><th>Batch</th><th>Current Status</th>
                </tr>
              </thead>
              <tbody>
                {(merge.sources || []).map((source, index) => {
                  const row = (sourceRows || []).find((r) => String(r._id) === String(source.barcodeId));
                  return (
                    <tr key={source._id || index}>
                      <td>{index + 1}</td>
                      <td className="font-semibold">{source.barcodeNo}</td>
                      <td>{source.qty}</td>
                      <td>{source.uom}</td>
                      <td>{Number(source.conversionFactor) === 1 ? '1:1' : '×' + source.conversionFactor}</td>
                      <td>{source.qtyInMergedUom}</td>
                      <td>{source.purchaseRate}</td>
                      <td>{source.rsp}</td>
                      <td>{source.wsp}</td>
                      <td>{source.dp}</td>
                      <td>{source.sellingPrice}</td>
                      <td>{source.grcNo || '—'}</td>
                      <td>{source.batchNo || '—'}</td>
                      <td>{row?.status || '—'}</td>
                    </tr>
                  );
                })}
                {!(merge.sources || []).length && <tr><td colSpan={14} className="dt-empty">No sources.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="print-area">
        <BarcodeLabelSheet rows={labelRows} format={format} />
      </div>
    </>
  );
}
