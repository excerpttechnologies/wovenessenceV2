'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import BarcodeSvg from './BarcodeSvg';
import { RETURN_REASONS } from './transferConstants';
import { useScanner, useScanSound } from './useScanner';

/* ==========================================================================
   One stock transfer, from despatch to bill.

   Everything the document can have done to it lives on this screen, and each
   action is offered only when the SERVER says this user may do it (the `can`
   block the detail route returns) and the document's state allows it. A
   button that would be refused is not shown, and no button here is
   decorative.

   Receiving and returning both work by selection OR by scanner: at a loading
   bay the operator scans what came off the lorry, and the rows tick
   themselves.
   ========================================================================== */

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v || 0).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
const dateText = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

const STATUS_STYLE = {
  DRAFT: 'bg-[#eceff4] text-inkmuted',
  IN_TRANSIT: 'bg-[#fff4d6] text-[#8a6100]',
  PARTIALLY_RECEIVED: 'bg-[#e7f3ff] text-[#0d5ddc]',
  RECEIVED: 'bg-[#e6f7ed] text-[#0b7a3e]',
  RETURN_IN_TRANSIT: 'bg-[#ffe9e9] text-[#b42318]',
  PARTIALLY_RETURNED: 'bg-[#ffe9e9] text-[#b42318]',
  COMPLETED: 'bg-[#e6f7ed] text-[#0b7a3e]',
  CANCELLED: 'bg-[#eceff4] text-inkmuted',
};

export default function StockTransferDetail({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState('');
  const [returnBox, setReturnBox] = useState(null);
  const [bill, setBill] = useState(null);
  const beep = useScanSound();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/stock-transfer/' + id, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Could not load this transfer.'); return; }
      setData(d);
      setPicked([]);
    } catch {
      setError('Could not reach the server.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const doc = data?.doc;
  const can = data?.can || {};

  /* Which lines each action may touch, decided from the lines themselves so
     the buttons cannot disagree with the document. */
  const groups = useMemo(() => {
    const lines = doc?.lines || [];
    return {
      open: lines.filter((l) => !l.received && !l.returned),
      received: lines.filter((l) => l.received && !l.returned),
      returned: lines.filter((l) => l.returned),
      awaitingReturn: lines.filter((l) => l.returned && !l.returnAccepted),
    };
  }, [doc]);

  /* what the current selection is eligible for */
  const mode = useMemo(() => {
    if (!picked.length) return null;
    const lines = (doc?.lines || []).filter((l) => picked.includes(l.barcodeNo));
    if (lines.every((l) => !l.received && !l.returned)) return 'open';
    if (lines.every((l) => l.returned && !l.returnAccepted)) return 'awaitingReturn';
    if (lines.every((l) => l.received && !l.returned)) return 'received';
    return 'mixed';
  }, [picked, doc]);

  const toggle = (barcodeNo) =>
    setPicked((p) => (p.includes(barcodeNo) ? p.filter((b) => b !== barcodeNo) : [...p, barcodeNo]));

  const pickAll = (list) => setPicked(list.map((l) => l.barcodeNo));

  /* ------------------------------------------------------ scanner ------- */
  const onScan = useCallback((code) => {
    const line = (doc?.lines || []).find((l) => l.barcodeNo === code);
    if (!line) {
      setFlash({ type: 'err', msg: 'Barcode ' + code + ' is not on transfer ' + (doc?.transferNo || '') + '.' });
      beep('err');
      return;
    }
    if (line.received && !line.returned) {
      setFlash({ type: 'err', msg: 'Barcode ' + code + ' has already been received on this transfer.' });
      beep('err');
      return;
    }
    if (line.returned && line.returnAccepted) {
      setFlash({ type: 'err', msg: 'Barcode ' + code + ' has already been returned and taken back.' });
      beep('err');
      return;
    }
    setPicked((p) => (p.includes(code) ? p : [...p, code]));
    setFlash({ type: 'ok', msg: line.itemName + ' selected (' + code + ')' });
    beep('ok');
  }, [doc, beep]);

  useScanner(onScan, { enabled: Boolean(doc) && !busy });

  /* -------------------------------------------------------- actions ----- */
  async function post(path, body, label) {
    setBusy(label);
    setFlash(null);
    try {
      const r = await fetch('/api/stock-transfer/' + id + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || Object.values(d.errors || {})[0] || 'That could not be done.' });
        beep('err');
        return null;
      }
      await load();
      beep('ok');
      return d;
    } finally {
      setBusy('');
    }
  }

  async function receive() {
    const codes = picked.length ? picked : groups.open.map((l) => l.barcodeNo);
    const d = await post('/receive', { barcodes: codes }, 'receive');
    if (d) setFlash({ type: 'ok', msg: 'Received ' + d.receivedCount + ' item(s). ' + d.pendingCount + ' still in transit.' });
  }

  async function submitReturn({ reason, notes }) {
    const d = await post('/return', { barcodes: picked, reason, notes }, 'return');
    setReturnBox(null);
    if (d) {
      setFlash({
        type: 'ok',
        msg: 'Returned ' + d.returnedCount + ' item(s). Billable quantity is now ' + qtyText(d.billableQty) + '.',
      });
    }
  }

  async function acceptReturn() {
    const codes = picked.length ? picked : groups.awaitingReturn.map((l) => l.barcodeNo);
    const d = await post('/accept-return', { barcodes: codes }, 'accept');
    if (d) setFlash({ type: 'ok', msg: 'Took back ' + d.acceptedCount + ' item(s) into stock.' });
  }

  async function previewBill() {
    const r = await fetch('/api/stock-transfer/' + id + '/bill');
    const d = await r.json();
    if (!r.ok) { setFlash({ type: 'err', msg: d.error }); return; }
    setBill(d);
  }

  async function raiseBill(force = false) {
    const d = await post('/bill', { force }, 'bill');
    if (d) { setBill(d); setFlash({ type: 'ok', msg: 'Billed as ' + d.billingNo + '.' }); }
  }

  if (error) return <div className="card"><div className="card-body text-danger">{error}</div></div>;
  if (!doc) return <div className="card"><div className="card-body text-inkmuted">Loading transfer...</div></div>;

  const settled = doc.receivedCount + doc.returnedCount;

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------ header --- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="box" size={15} /> {doc.transferNo}</span>
          <span className={'ml-2 rounded px-2 py-0.5 text-[11px] font-semibold ' + (STATUS_STYLE[doc.status] || '')}>
            {String(doc.status).replace(/_/g, ' ')}
          </span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="card-body">
          {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
              <Info label="From" value={doc.fromLocationName} sub={doc.fromGstn} />
              <Info label="To" value={doc.toLocationName} sub={doc.toGstn} />
              <Info label="Transfer Date" value={dateText(doc.transferDate)} />
              <Info label="Despatched By" value={doc.submittedBy} sub={dateText(doc.submittedAt)} />
              <Info label="Waybill" value={doc.waybill || '-'} />
              <Info label="Billing" value={doc.billingNo || 'Not billed'} sub={doc.billedAt ? dateText(doc.billedAt) : ''} />
            </div>

            {/* The document number as a scannable barcode. Scanning it in the
                transfer list opens this screen - that is the requirement, and
                the value encoded is the real document number, nothing else. */}
            <div className="rounded-md border border-line bg-white p-3 text-center">
              <BarcodeSvg value={doc.transferNo} height={52} />
              <div className="mt-1 text-[11px] text-inkmuted">Scan to open this transaction</div>
            </div>
          </div>

          {/* ------------------------------------------------- tiles ----- */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Tile label="Sent" value={qtyText(doc.sentQty)} sub={doc.sentCount + ' items'} />
            <Tile label="Received" value={qtyText(doc.receivedQty)} sub={doc.receivedCount + ' items'} tone="ok" />
            <Tile label="Returned" value={qtyText(doc.returnedQty)} sub={doc.returnedCount + ' items'} tone="err" />
            <Tile label="In Transit" value={qtyText(doc.pendingQty)} sub={doc.pendingCount + ' items'} tone="warn" />
            <Tile label="Billable" value={qtyText(doc.billableQty)} sub="sent - returned" tone="ok" />
            <Tile label="Total PC" value={qtyText(doc.totalPc)} />
            <Tile label="Total MTR" value={qtyText(doc.totalMtr)} />
          </div>

          {/* ------------------------------------------------ actions ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {can.receive && groups.open.length > 0 && (
              <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={receive}>
                {busy === 'receive' ? <span className="spin" /> : <Icon name="check" size={14} />}
                {picked.length && mode === 'open'
                  ? ' Receive ' + picked.length + ' selected'
                  : ' Receive all ' + groups.open.length + ' pending'}
              </button>
            )}

            {can.returnItems && picked.length > 0 && (mode === 'open' || mode === 'received') && (
              <button type="button" className="btn bg-danger text-white" disabled={Boolean(busy)}
                onClick={() => setReturnBox({ barcodes: picked })}>
                <Icon name="undo" size={14} /> Return {picked.length} item(s)
              </button>
            )}

            {can.acceptReturn && groups.awaitingReturn.length > 0 && (
              <button type="button" className="btn btn-dark" disabled={Boolean(busy)} onClick={acceptReturn}>
                {busy === 'accept' ? <span className="spin" /> : <Icon name="box" size={14} />}
                {picked.length && mode === 'awaitingReturn'
                  ? ' Take back ' + picked.length + ' selected'
                  : ' Take back all ' + groups.awaitingReturn.length + ' returned'}
              </button>
            )}

            {can.bill && !doc.billingNo && doc.billableCount > 0 && (
              <>
                <button type="button" className="btn" onClick={previewBill}>
                  <Icon name="eye" size={14} /> Preview Bill
                </button>
                <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => raiseBill(false)}>
                  {busy === 'bill' ? <span className="spin" /> : <Icon name="ledger" size={14} />} Raise Bill
                </button>
              </>
            )}

            {doc.billingNo && (
              <button type="button" className="btn" onClick={previewBill}>
                <Icon name="printer" size={14} /> View Bill {doc.billingNo}
              </button>
            )}

            <button
              type="button"
              className="btn"
              onClick={() => router.push('/admin/transaction/stocktransfers/transfer/' + id + '/challan')}
            >
              <Icon name="printer" size={14} /> Delivery Challan
            </button>

            {picked.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setPicked([])}>
                Clear selection ({picked.length})
              </button>
            )}
          </div>

          {mode === 'mixed' && (
            <div className="mt-2 text-[12px] text-danger">
              The selection mixes items at different stages. Pick rows that are all pending, all received,
              or all awaiting take-back.
            </div>
          )}

          <div className="kbd-hint mt-3">
            <Icon name="eye" size={13} /> Scan items with the barcode gun to tick them below - no need to click into a box first.
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- lines --- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Items ({doc.lines.length})</span>
          <span className="flex-1" />
          <span className="text-[12px] text-inkmuted">{settled} of {doc.lines.length} settled</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all pending"
                    checked={picked.length > 0 && picked.length === groups.open.length}
                    onChange={(e) => (e.target.checked ? pickAll(groups.open) : setPicked([]))}
                  />
                </th>
                <th>Barcode</th>
                <th>Item</th>
                <th>UOM</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">RSP</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => {
                const state = l.returned
                  ? (l.returnAccepted ? 'Returned & taken back' : 'Returned - awaiting take-back')
                  : l.received ? 'Received' : 'In transit';
                const tone = l.returned ? 'text-danger' : l.received ? 'text-[#0b7a3e]' : 'text-[#8a6100]';
                return (
                  <tr key={l.barcodeNo} className={picked.includes(l.barcodeNo) ? 'bg-[#f0f7ff]' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={'Select ' + l.barcodeNo}
                        checked={picked.includes(l.barcodeNo)}
                        onChange={() => toggle(l.barcodeNo)}
                      />
                    </td>
                    <td className="font-mono text-[12px]">{l.barcodeNo}</td>
                    <td className="max-w-[260px] truncate" title={l.itemName}>
                      {l.itemName || l.itemCode}
                      {l.itemCode && <span className="block text-[11px] text-inkmuted">{l.itemCode}</span>}
                    </td>
                    <td>{l.uom || l.uomType}</td>
                    <td>{l.batchType === 'batch' ? 'Batch' : 'Unique'}</td>
                    <td className="text-right">{qtyText(l.qty)}</td>
                    <td className="text-right">{money(l.rate)}</td>
                    <td className="text-right">{money(l.rsp)}</td>
                    <td className={tone + ' whitespace-nowrap text-[12px] font-semibold'}>{state}</td>
                    <td className="text-[11px] text-inkmuted">
                      {l.returned && (
                        <>
                          {l.returnReason}
                          {l.returnNotes ? ' - ' + l.returnNotes : ''}
                          <span className="block">{l.returnedBy} · {dateText(l.returnedAt)}</span>
                        </>
                      )}
                      {l.received && !l.returned && (
                        <>{l.receivedBy} · {dateText(l.receivedAt)}</>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------ history --- */}
      {data.history?.length > 0 && (
        <div className="card">
          <div className="card-head"><span className="card-title">Transaction History</span></div>
          <div className="card-body overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>When</th><th>Event</th><th>Barcode</th><th className="text-right">Qty</th>
                  <th>From → To</th><th>Reason</th><th>User</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h._id}>
                    <td className="whitespace-nowrap">{dateText(h.at)}</td>
                    <td>{String(h.type).replace(/_/g, ' ')}</td>
                    <td className="font-mono text-[12px]">{h.barcodeNo}</td>
                    <td className="text-right">{qtyText(h.qty)}</td>
                    <td>{[h.from, h.to].filter(Boolean).join(' → ') || '-'}</td>
                    <td>{h.reason || '-'}</td>
                    <td>{h.user || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {returnBox && (
        <ReturnDialog
          count={returnBox.barcodes.length}
          busy={busy === 'return'}
          onClose={() => setReturnBox(null)}
          onSubmit={submitReturn}
        />
      )}

      {bill && <BillDialog bill={bill} onClose={() => setBill(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------- pieces --- */

function Info({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <span className="text-inkmuted">{label}: </span>
      <span className="font-medium text-ink">{value || '-'}</span>
      {sub ? <span className="block text-[11px] text-inkmuted">{sub}</span> : null}
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  const bg = tone === 'ok' ? 'bg-[#e6f7ed]' : tone === 'err' ? 'bg-[#ffe9e9]' : tone === 'warn' ? 'bg-[#fff4d6]' : 'bg-[#f7f9fc]';
  return (
    <div className={'rounded-md border border-line p-3 ' + bg}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{label}</div>
      <div className="text-lg font-bold text-ink">{value}</div>
      {sub ? <div className="text-[11px] text-inkmuted">{sub}</div> : null}
    </div>
  );
}

function ReturnDialog({ count, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [notes, setNotes] = useState('');
  const needNotes = reason === 'Other';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-lg font-semibold">Return {count} item(s)</h2>
          <button type="button" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <p className="mb-3 text-[12px] text-inkmuted">
          Returned items are excluded from billing automatically - the bill will be raised on
          the despatched quantity minus what goes back.
        </p>

        <label className="field-label">
          Reason<span className="f-req">*</span>
          <select className="f-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>

        <label className="field-label mt-3">
          Notes{needNotes && <span className="f-req">*</span>}
          <textarea
            className="f-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={needNotes ? 'Describe the reason' : 'Optional'}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn bg-danger text-white"
            disabled={busy || (needNotes && !notes.trim())}
            onClick={() => onSubmit({ reason, notes })}
          >
            {busy ? <span className="spin" /> : <Icon name="undo" size={14} />} Confirm Return
          </button>
        </div>
      </div>
    </div>
  );
}

function BillDialog({ bill, onClose }) {
  const q = bill.quantities || {};
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-lg font-semibold">
            Billing {bill.billingNo ? '· ' + bill.billingNo : 'preview'} for {bill.transferNo}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="mb-3 rounded border border-line bg-[#f7f9fc] p-3 text-[13px]">
          <b>Billable quantity is worked out for you:</b>{' '}
          despatched {qtyText(q.sent)} − returned {qtyText(q.returned)} ={' '}
          <b>{qtyText(q.billable)}</b> ({q.billableCount} items).
        </div>

        <table className="dt">
          <thead>
            <tr>
              <th>Barcode</th><th>Item</th><th>HSN</th><th className="text-right">Qty</th>
              <th className="text-right">Rate</th><th className="text-right">RSP</th>
              <th className="text-right">Taxable</th><th className="text-right">GST</th><th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(bill.lines || []).map((l) => (
              <tr key={l.barcodeNo}>
                <td className="font-mono text-[12px]">{l.barcodeNo}</td>
                <td>{l.itemName}</td>
                <td>{l.hsn}</td>
                <td className="text-right">{qtyText(l.qty)}</td>
                <td className="text-right">{money(l.rate)}</td>
                <td className="text-right font-semibold">{money(l.rsp)}</td>
                <td className="text-right">{money(l.taxable)}</td>
                <td className="text-right">{money(l.gstAmount)}</td>
                <td className="text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(bill.excluded || []).length > 0 && (
          <>
            <div className="mt-4 text-[13px] font-semibold text-danger">Excluded from this bill (returned)</div>
            <table className="dt">
              <thead><tr><th>Barcode</th><th>Item</th><th className="text-right">Qty</th><th>Reason</th><th>Taken back</th></tr></thead>
              <tbody>
                {bill.excluded.map((l) => (
                  <tr key={l.barcodeNo}>
                    <td className="font-mono text-[12px]">{l.barcodeNo}</td>
                    <td>{l.itemName}</td>
                    <td className="text-right">{qtyText(l.qty)}</td>
                    <td>{l.reason}{l.notes ? ' - ' + l.notes : ''}</td>
                    <td>{l.acceptedBack ? 'Yes' : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs text-[13px]">
            <Row label="Taxable" value={money(bill.totals?.taxable)} />
            <Row label="GST" value={money(bill.totals?.gst)} />
            <Row label="RSP Value" value={money(bill.totals?.rspValue)} />
            <div className="mt-1 border-t border-line pt-1">
              <Row label="Net Payable" value={money(bill.totals?.net)} bold />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="printer" size={14} /> Print
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={'flex justify-between py-0.5 ' + (bold ? 'font-bold' : '')}>
      <span className="text-inkmuted">{label}</span><span>{value}</span>
    </div>
  );
}
