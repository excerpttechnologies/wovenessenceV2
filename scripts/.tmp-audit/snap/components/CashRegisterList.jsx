'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';

/* ==========================================================================
   Cash Registers - list.

   Not built on ListView: the row action is a labelled red Close button that
   opens a dialog, and ADD opens a dialog rather than navigating. ListView
   expresses neither. Same reasoning as StockTransferPacketList.
   ========================================================================== */

const ENDPOINT = '/api/cash-register';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => num(v).toFixed(2);

/* "29-06-2026 10:29 AM" - the format the deployed list uses */
export function stamp(v) {
  if (!v) return '';
  const x = new Date(v);
  if (Number.isNaN(x.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  let h = x.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return p(x.getDate()) + '-' + p(x.getMonth() + 1) + '-' + x.getFullYear()
    + ' ' + p(h) + ':' + p(x.getMinutes()) + ' ' + ampm;
}

/* --------------------------------------------------------------- dialogs */

function OpenDialog({ onClose, onDone }) {
  const scope = useScope();
  const [opening, setOpening] = useState('0');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalance: num(opening),
          note,
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not open the register.'); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-24"
      onMouseDown={onClose}
    >
      <div className="w-full max-w-[420px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-4 py-3">
          <span className="text-[15px] font-bold">Open Cash Register</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="px-4 py-4">
          {err && <div className="flash flash-err">{err}</div>}
          <label className="f-label">Opening Balance<span className="f-req">*</span></label>
          <input
            type="number" min="0" autoFocus
            className="f-input"
            value={opening}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => setOpening(e.target.value)}
          />
          <label className="f-label mt-3">Note</label>
          <input className="f-input" value={note} onChange={(e) => setNote(e.target.value)} />

          <button
            type="button"
            className="btn btn-primary btn-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? <span className="spin" /> : <Icon name="save" size={14} />} Open Register
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseDialog({ row, onClose, onDone }) {
  const [closing, setClosing] = useState('0');
  const [note, setNote] = useState(row.note || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(ENDPOINT + '/' + row._id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingBalance: num(closing), note }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not close the register.'); return; }
      onDone(d);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-24"
      onMouseDown={onClose}
    >
      <div className="w-full max-w-[420px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-4 py-3">
          <span className="text-[15px] font-bold">Close Cash Register</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="px-4 py-4">
          {err && <div className="flash flash-err">{err}</div>}

          <div className="mb-3 rounded border border-line bg-[#f7f9fc] px-3 py-2 text-[13px]">
            <div className="flex">
              <span className="flex-1 text-cell">Opened</span>
              <span>{stamp(row.openedAt)}</span>
            </div>
            <div className="flex">
              <span className="flex-1 text-cell">Opening Balance</span>
              <span>&#8377; {money(row.openingBalance)}</span>
            </div>
          </div>

          <label className="f-label">Closing Balance (counted)<span className="f-req">*</span></label>
          <input
            type="number" min="0" autoFocus
            className="f-input"
            value={closing}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => setClosing(e.target.value)}
          />
          <label className="f-label mt-3">Note</label>
          <input className="f-input" value={note} onChange={(e) => setNote(e.target.value)} />

          <p className="mt-3 text-[12px] text-inkmuted">
            The expected balance is worked out on the server from POS taken while
            this register was open, and the difference is stored with the close.
          </p>

          <button
            type="button"
            className="btn btn-submit bg-danger text-white"
            onClick={submit}
            disabled={busy}
          >
            {busy ? <span className="spin" /> : <Icon name="save" size={14} />} Close Register
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ list */

export default function CashRegisterList() {
  const router = useRouter();
  const { business, location, finYear } = useScope();

  const [state, setState] = useState({ rows: [], page: 1, pages: 1, total: 0, hasOpen: false });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState(false);
  const [closingRow, setClosingRow] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    if (!business) { setLoading(false); return; }
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      business: business || '', location: location || '', finYear: finYear || '',
    });
    try {
      const r = await fetch(ENDPOINT + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], page: d.page || 1, pages: d.pages || 1,
        total: d.total || 0, hasOpen: Boolean(d.hasOpen),
      });
    } finally {
      setLoading(false);
    }
  }, [page, business, location, finYear]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [business, location, finYear]);

  async function remove(id) {
    if (!window.confirm('Discard this open register? Nothing is recorded.')) return;
    const r = await fetch(ENDPOINT + '/' + id, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      window.alert(d.error || 'Could not delete that register.');
      return;
    }
    load();
  }

  return (
    <>
      {opening && (
        <OpenDialog
          onClose={() => setOpening(false)}
          onDone={() => { setOpening(false); setFlash('Register opened.'); setPage(1); load(); }}
        />
      )}

      {closingRow && (
        <CloseDialog
          row={closingRow}
          onClose={() => setClosingRow(null)}
          onDone={(d) => {
            setClosingRow(null);
            const diff = Number(d.differenceBalance || 0);
            setFlash(
              diff === 0
                ? 'Register closed and balanced.'
                : 'Register closed. ' + (diff > 0 ? 'Over' : 'Short') + ' by ₹ '
                  + Math.abs(diff).toFixed(2) + '.'
            );
            load();
          }}
        />
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title">Cash Registers</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="card-body">
          {flash && <div className="flash flash-ok">{flash}</div>}
          {!business && (
            <div className="flash flash-err">Select a business in the top bar.</div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!business || !location || state.hasOpen}
              title={
                state.hasOpen
                  ? 'A register is already open for this location'
                  : !location ? 'Select a location in the top bar' : ''
              }
              onClick={() => setOpening(true)}
            >
              <Icon name="plus" size={14} /> ADD
            </button>
            {state.hasOpen && (
              <button
                type="button"
                className="btn"
                onClick={() => router.push('/admin/cashregister/open')}
              >
                <Icon name="eye" size={13} /> Open register
              </button>
            )}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>Opened At</th>
                  <th>Closed At</th>
                  <th>Status</th>
                  <th className="text-right">Opening Bal</th>
                  <th className="text-right">Closing Bal</th>
                  <th className="text-right">Expected Bal</th>
                  <th className="text-right">Difference Bal</th>
                  <th style={{ width: 130 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="dt-empty"><span className="spin" /></td></tr>
                )}
                {!loading && state.rows.length === 0 && (
                  <tr><td colSpan={8} className="dt-empty">No Data..</td></tr>
                )}
                {!loading && state.rows.map((row) => {
                  const isOpen = row.status === 'Open';
                  const diff = num(row.differenceBalance);
                  return (
                    <tr key={row._id}>
                      <td>{stamp(row.openedAt)}</td>
                      <td>{stamp(row.closedAt)}</td>
                      <td>
                        <span className={'pill ' + (isOpen ? 'pill-green' : 'pill-grey')}>
                          {row.status}
                        </span>
                      </td>
                      <td className="text-right">{money(row.openingBalance)}</td>
                      <td className="text-right">{money(row.closingBalance)}</td>
                      <td className="text-right">{money(row.expectedBalance)}</td>
                      <td
                        className={
                          'text-right '
                          + (!isOpen && diff !== 0 ? 'font-bold text-danger' : '')
                        }
                      >
                        {money(row.differenceBalance)}
                      </td>
                      <td>
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className="h-[26px] rounded border-0 bg-danger px-3 text-xs text-white"
                              onClick={() => setClosingRow(row)}
                            >
                              Close
                            </button>
                            <button
                              type="button"
                              className="act-btn bg-[#9aa6ba]"
                              title="Discard"
                              onClick={() => remove(row._id)}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </span>
                        ) : (
                          <span className="text-inkmuted">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center pt-3 text-[13px] text-cell">
            <span>Page <b className="text-brand-link">{state.page}</b> of {state.pages}</span>
            <span className="flex-1" />
            <span className="flex gap-2">
              <button className="btn" disabled={state.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn" disabled={state.page >= state.pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
