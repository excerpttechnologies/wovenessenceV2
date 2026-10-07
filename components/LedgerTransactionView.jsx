'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';
import { FILTERS, COLUMNS, PER_PAGE } from '@/app/admin/ledger-transaction/fields';

/* ==========================================================================
   Ledger Transactions - one read-only screen.

   Not built on ListView, for three reasons the deployed page makes plain:
   there is no ADD button, no per-row actions, and the filter card carries a
   Reset next to Search. ListView assumes all three.

   Filter values are held locally and only applied when Search is pressed,
   which is how every other filter card in this project behaves.
   ========================================================================== */

const BLANK = FILTERS.reduce((a, f) => ({ ...a, [f.k]: '' }), {});

export default function LedgerTransactionView() {
  const { business, location, finYear } = useScope();

  const [draft, setDraft] = useState(BLANK);
  const [applied, setApplied] = useState(BLANK);
  const [state, setState] = useState({ rows: [], total: 0, page: 1, pages: 1, capped: false });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      perPage: String(PER_PAGE),
      business: business || '',
      location: location || '',
      finYear: finYear || '',
    });
    Object.entries(applied).forEach(([k, v]) => { if (v) qs.set(k, v); });

    try {
      const r = await fetch('/api/ledger-transaction?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], total: d.total || 0,
        page: d.page || 1, pages: d.pages || 1, capped: Boolean(d.capped),
      });
    } finally {
      setLoading(false);
    }
  }, [page, applied, business, location, finYear]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [applied, business, location, finYear]);

  const cellText = (row, col) => (col.f ? fmt(col.f, row[col.k]) : (row[col.k] ?? ''));
  const exportHeaders = () => COLUMNS.map((c) => c.t);
  const exportRows = () => state.rows.map((r) => COLUMNS.map((c) => cellText(r, c)));

  return (
    <>
      {/* ----------------------------------------------------- filter --- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Filter Ledger Transactions</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
            {FILTERS.map((f) => (
              <div key={f.k}>
                <label className="f-label">{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    className="f-input"
                    value={draft[f.k]}
                    onChange={(e) => set(f.k, e.target.value)}
                  >
                    <option value="">{f.placeholder || 'Select...'}</option>
                    {f.opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    className="f-input"
                    placeholder={f.type === 'date' ? 'dd-mm-yyyy' : (f.placeholder || '')}
                    value={draft[f.k]}
                    onChange={(e) => set(f.k, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setApplied(draft); }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => { setDraft(BLANK); setApplied(BLANK); }}
            >
              <Icon name="refresh" size={14} /> Reset
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setApplied(draft)}>
              Search
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ results --- */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">Ledgers Transactions</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="card-body">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button" className="btn"
              onClick={() => download('ledger-transactions.csv',
                toCsv(exportHeaders(), exportRows()), 'text/csv')}
            >
              <Icon name="file" size={14} /> Export to CSV
            </button>
            <button
              type="button" className="btn"
              onClick={() => download('ledger-transactions.xls',
                toXlsHtml('Ledgers Transactions', exportHeaders(), exportRows()),
                'application/vnd.ms-excel')}
            >
              <Icon name="file" size={14} /> Export to Excel
            </button>
            <button
              type="button" className="btn"
              onClick={() => printTable('Ledgers Transactions', exportHeaders(), exportRows())}
            >
              <Icon name="file" size={14} /> Export to PDF
            </button>
          </div>

          {/* the exports carry the page on screen, not the whole result set -
              the same limitation every other list in this project has */}
          {state.capped && (
            <div className="flash flash-err mt-3">
              This financial year holds more entries than one page can merge.
              Showing the most recent; narrow the dates or pick a document type.
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>{COLUMNS.map((c) => <th key={c.t}>{c.t}</th>)}</tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={COLUMNS.length} className="dt-empty"><span className="spin" /></td></tr>
                )}
                {!loading && state.rows.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="dt-empty">No Data..</td></tr>
                )}
                {!loading && state.rows.map((row) => (
                  <tr key={row._id}>
                    <td className="text-brand-link">{row.ledgerName}</td>
                    <td>{row.contact}</td>
                    <td>{row.type}</td>
                    {/* amount is the figure the eye goes to, so it carries the
                        accent colour the deployed screen gives it */}
                    <td className="text-danger">{fmt('amount', row.amount)}</td>
                    <td>{row.description}</td>
                    <td>{row.docType}</td>
                    <td>{row.docNumber}</td>
                  </tr>
                ))}
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
