'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { useClientTable } from '@/components/NumberedPager';

/* Inter Company Sell > Auto Purchases Receiveds - the RECEIVER's side of a
   consignment Sales Invoice (user, 14-10-2026).

   The sender bills sold units on Sales Invoice and generates the e-invoice
   (IRN). From then the invoice waits here, under Pending, for the branch it
   was raised on (the one in the top bar). Every pending invoice is shown
   ON THE SCREEN with all its lines (no popup - user, 14-10-2026): the
   receiver checks them, corrects Product Group / HSN where needed, and
   presses that invoice's Save. It then moves to Received below with its own
   Rec No; Received rows open read-only in a popup.

   Saving is a RECORD only - no stock moves: the goods came into this
   branch's stock when it approved the Delivery Challan.

   Data: /api/ic-purchase-received. NOT the older hidden
   auto-purchases-received screen (whole-challan billing, GRC per invoice). */

const money2 = (v) => Number(v || 0).toFixed(2);
const qtyText = (v) => String(Math.round((Number(v) || 0) * 100) / 100);
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');
const gstOf = (l) => Number(l.igstPct || 0) || (Number(l.cgstPct || 0) + Number(l.sgstPct || 0));

const PAGE = 10;

export default function AutoPurchaseReceivedsPage() {
  const scope = useScope();
  const [pending, setPending] = useState([]);
  const [received, setReceived] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  /* the receiver's Product Group / HSN choices per pending invoice:
     { [invoiceId]: [{ productGroupId, productGroupName, hsn }, ...] } */
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  /* the received record open in the read-only popup */
  const [viewRow, setViewRow] = useState(null);
  const [groups, setGroups] = useState([]);
  const [hsns, setHsns] = useState([]);

  const load = useCallback(async () => {
    if (!scope.business) { setPending([]); setReceived([]); return; }
    setLoading(true);
    const ask = (view) => fetch('/api/ic-purchase-received?' + new URLSearchParams({
      business: scope.business, location: scope.location || '', view,
    }), { cache: 'no-store' }).then((r) => r.json());
    try {
      const [p, r] = await Promise.all([ask('pending'), ask('received')]);
      if (p.error || r.error) { setFlash({ type: 'err', msg: p.error || r.error }); return; }
      setPending(Array.isArray(p.rows) ? p.rows : []);
      setReceived(Array.isArray(r.rows) ? r.rows : []);
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setLoading(false);
    }
  }, [scope.business, scope.location]);

  useEffect(() => { load(); }, [load]);

  /* this branch's Product Groups and HSN codes for the line pickers */
  useEffect(() => {
    if (!scope.business) { setGroups([]); setHsns([]); return undefined; }
    let off = false;
    const opts = (ref) => fetch('/api/options?' + new URLSearchParams({ ref, business: scope.business }), { cache: 'no-store' })
      .then((r) => r.json()).then((d) => (Array.isArray(d.options) ? d.options : [])).catch(() => []);
    Promise.all([opts('product/group'), opts('hsn')]).then(([g, h]) => {
      if (off) return;
      setGroups(g.map((o) => ({ value: String(o.value), label: o.label })));
      setHsns([...new Set(h.map((o) => String(o.label || '').trim()).filter(Boolean))]);
    });
    return () => { off = true; };
  }, [scope.business]);

  /* each newly shown invoice starts its lines on the Product Group whose
     name matches the item's group on the Item master, and on the invoice's
     HSN. Choices already made are kept across a refresh. */
  useEffect(() => {
    const suggest = (l) => groups.find((o) => o.label.trim().toLowerCase() === String(l.suggestedGroup || '').trim().toLowerCase());
    setEdits((prev) => {
      const next = {};
      pending.forEach((row) => {
        const old = prev[row.invoiceId];
        next[row.invoiceId] = (row.items || []).map((l, n) => {
          const o = old?.[n];
          /* a line the user has picked for is left alone; one still blank
             is (re)filled - the group list may only have arrived now */
          if (o && (o.touched || o.productGroupId)) return o;
          const g = suggest(l);
          return { productGroupId: g?.value || '', productGroupName: g?.label || '', hsn: o?.hsn || l.hsn || '' };
        });
      });
      return next;
    });
  }, [pending, groups]);

  useEffect(() => {
    if (!flash || flash.type !== 'ok') return undefined;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const setLine = (invoiceId, n, patch) => setEdits((s) => ({
    ...s,
    [invoiceId]: (s[invoiceId] || []).map((l, i) => (i === n ? { ...l, ...patch, touched: true } : l)),
  }));

  const shownPending = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    return q
      ? pending.filter((r) => [r.invoiceNo, r.fromBusinessName, r.fromLocationName].join(' ').toLowerCase().includes(q))
      : pending;
  }, [pending, pendingSearch]);

  /* numbered pager over the pending invoices (19-10-2026). They are cards,
     not table rows, so there is no header to sort by; the Product Group /
     HSN choices live in `edits`, keyed by invoice, so they survive a page
     change. */
  const pendingView = useClientTable(shownPending, () => '');

  async function save(row) {
    if (savingId) return;
    setSavingId(row.invoiceId);
    setFlash(null);
    try {
      const r = await fetch('/api/ic-purchase-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
          data: { invoiceId: row.invoiceId, lines: edits[row.invoiceId] || [] },
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Could not save.' }); load(); return; }
      setFlash({ type: 'ok', msg: 'Invoice ' + row.invoiceNo + ' received as ' + d.recNo + '.' });
      load();
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setSavingId('');
    }
  }

  return (
    <div>
      {flash && (
        <div className={'mb-3 flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>
      )}

      {/* --------------------------------------------------- PENDING -- */}
      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center border-b border-line pb-2">
          <span className="card-title">Pending Auto Purchases Receiveds</span>
          {pending.length > 0 && (
            <span className="ml-2 rounded bg-[#fff3cd] px-2 py-0.5 text-[11.5px] font-semibold text-warnyellow">
              {pending.length} invoice(s) waiting
            </span>
          )}
          <span className="flex-1" />
          <button type="button" className="btn" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="mb-3 max-w-[260px]">
          <input className="f-input" placeholder="Search" value={pendingSearch} onChange={(e) => { setPendingSearch(e.target.value); pendingView.firstPage(); }} />
        </div>

        {loading && <div className="dt-empty py-6 text-center">Loading...</div>}
        {!loading && !shownPending.length && (
          <div className="rounded border border-line py-10 text-center">
            <div className="font-semibold">{scope.business ? 'No records found' : 'Select a Business in the top bar.'}</div>
            {scope.business && <div className="text-[12px] text-inkmuted">Try adjusting your filters or search terms</div>}
          </div>
        )}

        {!loading && pendingView.rows.map((row) => (
          <div key={row.invoiceId} className="mb-5 rounded border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span>Invoice No: <b>{row.invoiceNo || '-'}</b></span>
              <span>Date: {day(row.invoiceDate)}</span>
              <span>Transfer Business: <b>{row.fromBusinessName || '-'}</b></span>
              <span>Transfer Location: {row.fromLocationName || '-'}</span>
            </div>
            {row.irn && <div className="mb-2 break-all text-[12px] text-inkmuted">IRN: {row.irn}</div>}

            <LinesTable
              row={row}
              lines={edits[row.invoiceId] || []}
              editable
              onLine={(n, patch) => setLine(row.invoiceId, n, patch)}
              groups={groups}
              hsns={hsns}
            />
            <Totals row={row} />

            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary min-w-[220px] justify-center"
                disabled={!!savingId}
                onClick={() => save(row)}
              >
                {savingId === row.invoiceId ? <span className="spin" /> : <Icon name="save" size={14} />} Save
              </button>
            </div>
          </div>
        ))}
        {!loading && shownPending.length > 0 && pendingView.pager}
      </div>

      {/* -------------------------------------------------- RECEIVED -- */}
      <ReceivedSection loading={loading} onRefresh={load} rows={received} onView={setViewRow} />

      {/* read-only view of a received record */}
      {viewRow && <ViewReceived row={viewRow} onClose={() => setViewRow(null)} />}
    </div>
  );
}

/* an invoice's lines - Product Group / HSN as pickers when editable */
function LinesTable({ row, lines, editable = false, onLine, groups = [], hsns = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            <th style={{ width: 44 }}>Sl No</th>
            <th>DC Code / Item</th>
            <th style={{ width: 200 }}>Product Group</th>
            <th style={{ width: 150 }}>HSN</th>
            <th className="!text-right" style={{ width: 90 }}>Rate</th>
            <th className="!text-right" style={{ width: 60 }}>GST %</th>
            <th className="!text-right" style={{ width: 80 }}>Discount</th>
            <th className="!text-right" style={{ width: 90 }}>IGST</th>
            <th className="!text-right" style={{ width: 90 }}>CGST</th>
            <th className="!text-right" style={{ width: 90 }}>SGST</th>
            <th className="!text-right" style={{ width: 100 }}>Net Amount</th>
          </tr>
        </thead>
        <tbody>
          {(row.items || []).map((l, n) => {
            const edit = lines[n] || {};
            const hsnChoices = [...new Set([edit.hsn, l.hsn, ...hsns].filter(Boolean))];
            return (
              <tr key={n}>
                <td className="text-center">{n + 1}</td>
                <td className="text-[12px] leading-tight">
                  <div>DC Code: <b>{l.dcNo || '-'}</b></div>
                  <div>Code: {l.itemCode || l.barcodeNo || '-'}{l.itemName && l.itemName !== l.itemCode ? ' - ' + l.itemName : ''}</div>
                  <div>Qty: {qtyText(l.qty)} {l.uom || ''}</div>
                </td>
                <td>
                  {editable ? (
                    <select
                      className="f-input h-8"
                      value={edit.productGroupId || ''}
                      onChange={(e) => onLine(n, {
                        productGroupId: e.target.value,
                        productGroupName: groups.find((g) => g.value === e.target.value)?.label || '',
                      })}
                    >
                      <option value="">--Select--</option>
                      {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  ) : (edit.productGroupName || '-')}
                </td>
                <td>
                  {editable ? (
                    <select className="f-input h-8" value={edit.hsn || ''} onChange={(e) => onLine(n, { hsn: e.target.value })}>
                      <option value="">--Select--</option>
                      {hsnChoices.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  ) : (edit.hsn || '-')}
                </td>
                <td className="!text-right">{money2(l.finalRate || l.unitRate)}</td>
                <td className="!text-right">{gstOf(l)}</td>
                <td className="!text-right">{money2(l.discountPct)}</td>
                <td className="!text-right">{money2(l.igstAmount)}</td>
                <td className="!text-right">{money2(l.cgstAmount)}</td>
                <td className="!text-right">{money2(l.sgstAmount)}</td>
                <td className="!text-right font-semibold">{money2(l.netAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Totals({ row }) {
  return (
    <div className="mt-3 flex justify-end">
      <div className="min-w-[320px] rounded border border-line p-3 text-[13px]">
        <div className="flex justify-between gap-6"><span>Taxable Value</span><span>{money2(row.taxableValue)}</span></div>
        {(row.cgstTotal > 0 || row.sgstTotal > 0) && (
          <div className="flex justify-between gap-6"><span>CGST + SGST</span><span>{money2(row.cgstTotal + row.sgstTotal)}</span></div>
        )}
        {row.igstTotal > 0 && (
          <div className="flex justify-between gap-6"><span>IGST</span><span>{money2(row.igstTotal)}</span></div>
        )}
        <div className="flex justify-between gap-6"><span>Round Off</span><span>{money2(row.roundOff)}</span></div>
        <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1 text-[14px] font-bold">
          <span>Net Value</span><span>{money2(row.netValue)}</span>
        </div>
      </div>
    </div>
  );
}

/* VIEW AUTO PURCHASE RECEIVED - laid out like the client's reference
   (user, 14-10-2026): the record's particulars on top, then Items Details
   with the line AS INVOICED (Old) beside the line AS RECEIVED (after the
   receiver's Product Group / HSN choice). Lines where the receiver changed
   the HSN are marked in the Received HSN cell. */
function ViewReceived({ row, onClose }) {
  const info = [
    ['Received No', row.recNo],
    ['Received Date', day(row.receivedAt || row.createdAt)],
    ['Sales Invoice No', row.invoiceNo],
    ['Status', <span key="s" className="rounded bg-[#e9f7ef] px-2 py-0.5 text-[11px] font-bold text-okgreen">RECEIVED</span>],
    ['Invoice Date', day(row.invoiceDate)],
    ['Financial Year', row.finYear],
    ['From Business', row.fromBusinessName],
    ['From Location', row.fromLocationName],
    ['Received By', row.createdBy],
    ['IRN', row.irn],
  ];
  const cell = 'border border-line px-2 py-1';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <div className="my-6 w-full max-w-[1500px] rounded-lg bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-5 py-3">
          <span className="card-title">View Auto Purchase Received</span>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white"
            onClick={onClose}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="p-5 text-[13px]">
          {/* particulars, two pairs per row */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-1.5 md:grid-cols-2">
            {info.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[150px_1fr] gap-2">
                <span className="font-semibold">{label}</span>
                <span className={label === 'IRN' ? 'break-all text-[12px] text-inkmuted' : 'text-inkmuted'}>{value || '-'}</span>
              </div>
            ))}
          </div>

          <div className="mb-2 mt-5 font-semibold text-brand-link">Items Details</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-thead">
                <tr>
                  <th className={cell + ' text-left'} rowSpan={2}>Sl No</th>
                  <th className={cell + ' text-left'} rowSpan={2}>Item Code</th>
                  <th className={cell + ' text-left'} rowSpan={2}>DC Code</th>
                  <th className={cell + ' text-center'} colSpan={3}>Old</th>
                  <th className={cell + ' text-center'} colSpan={4}>Received</th>
                  <th className={cell + ' text-right'} rowSpan={2}>Quantity</th>
                  <th className={cell + ' text-right'} rowSpan={2}>Unit Rate</th>
                  <th className={cell + ' text-right'} rowSpan={2}>GST %</th>
                  <th className={cell + ' text-right'} rowSpan={2}>Net Amount</th>
                </tr>
                <tr>
                  <th className={cell + ' text-left'}>Item Name</th>
                  <th className={cell + ' text-left'}>HSN Code</th>
                  <th className={cell + ' text-left'}>UOM</th>
                  <th className={cell + ' text-left'}>Item Name</th>
                  <th className={cell + ' text-left'}>Product Group</th>
                  <th className={cell + ' text-left'}>HSN Code</th>
                  <th className={cell + ' text-left'}>UOM</th>
                </tr>
              </thead>
              <tbody>
                {(row.items || []).map((l, n) => {
                  const oldHsn = l.invoiceHsn || l.hsn || '';
                  const changed = oldHsn && l.hsn && oldHsn !== l.hsn;
                  return (
                    <tr key={n} className={n % 2 ? 'bg-rowalt' : undefined}>
                      <td className={cell}>{n + 1}</td>
                      <td className={cell}>{l.itemCode || l.barcodeNo || '-'}</td>
                      <td className={cell}>{l.dcNo || '-'}</td>
                      <td className={cell + ' text-[#c26a00]'}>{l.itemName || '-'}</td>
                      <td className={cell + ' text-[#c26a00]'}>{oldHsn || '-'}</td>
                      <td className={cell + ' text-[#c26a00]'}>{l.uom || '-'}</td>
                      <td className={cell + ' text-okgreen'}>{l.itemName || '-'}</td>
                      <td className={cell + ' text-okgreen'}>{l.productGroupName || '-'}</td>
                      <td className={cell + ' text-okgreen' + (changed ? ' font-bold' : '')} title={changed ? 'Changed from ' + oldHsn : undefined}>
                        {l.hsn || '-'}{changed ? ' *' : ''}
                      </td>
                      <td className={cell + ' text-okgreen'}>{l.uom || '-'}</td>
                      <td className={cell + ' text-right'}>{qtyText(l.qty)}</td>
                      <td className={cell + ' text-right'}>{money2(l.finalRate || l.unitRate)}</td>
                      <td className={cell + ' text-right'}>{gstOf(l)}%</td>
                      <td className={cell + ' text-right font-semibold'}>{money2(l.netAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Totals row={row} />
        </div>
      </div>
    </div>
  );
}

/* the Received list: search, table, simple paging */
function ReceivedSection({ loading, onRefresh, rows, onView }) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter((r) => [r.recNo, r.invoiceNo, r.fromBusinessName, r.fromLocationName].join(' ').toLowerCase().includes(q))
      : rows;
  }, [rows, search]);
  /* numbered pager, Rows-per-page and sortable headers (19-10-2026) over
     the rows already loaded; the value is what the cell shows */
  const view = useClientTable(shown, (r, key) => {
    if (key === 'Date') {
      const at = r.receivedAt || r.createdAt;
      return at ? new Date(at) : '';
    }
    if (key === 'Net Value') return Number(r.netValue || 0);
    const field = { 'Rec No': 'recNo', 'Invoice No': 'invoiceNo', 'From Business': 'fromBusinessName', 'From Location': 'fromLocationName', 'Fin Year': 'finYear' }[key];
    return field ? r[field] || '' : '';
  });
  const slice = view.rows;
  const cols = ['Rec No', 'Invoice No', 'From Business', 'From Location', 'Date', 'Fin Year', 'Net Value', 'Action'];

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-center border-b border-line pb-2">
        <span className="card-title">Received Auto Purchases Receiveds</span>
        <span className="ml-2 rounded bg-pillgrey px-2 py-0.5 text-[11.5px] font-semibold text-inkmuted">{slice.length} on page</span>
        <span className="flex-1" />
        <button type="button" className="btn" onClick={onRefresh}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="mb-3 max-w-[260px]">
        <input className="f-input" placeholder="Search" value={search} onChange={(e) => { setSearch(e.target.value); view.firstPage(); }} />
      </div>

      <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>{cols.map((c) => (c === 'Action'
              ? <th key={c}>{c}</th>
              : view.th(c, c, c === 'Net Value' ? '!text-right' : undefined)))}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={cols.length} className="dt-empty">Loading...</td></tr>}
            {!loading && !slice.length && (
              <tr>
                <td colSpan={cols.length} className="dt-empty">
                  <div className="py-8">
                    <div className="font-semibold">No records found</div>
                    <div className="text-[12px] text-inkmuted">Try adjusting your filters or search terms</div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && slice.map((r) => (
              <tr key={r._id}>
                <td className="font-semibold">
                  {r.recNo || '-'} <Icon name="check" size={12} className="inline text-okgreen" />
                </td>
                <td>{r.invoiceNo || '-'}</td>
                <td>{r.fromBusinessName || '-'}</td>
                <td>{r.fromLocationName || '-'}</td>
                <td>{day(r.receivedAt || r.createdAt)}</td>
                <td>{r.finYear || '-'}</td>
                <td className="!text-right">{money2(r.netValue)}</td>
                <td>
                  <button type="button" className="act-btn act-blue" title="View" onClick={() => onView(r)}>
                    <Icon name="eye" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.pager}
    </div>
  );
}
